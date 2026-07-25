#!/usr/bin/env python3
"""Self-service CLI for Google Sheets, Docs, and Slides via Apps Script."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from apps_script_deploy import bootstrap_script

SKILL_DIR = Path(__file__).resolve().parents[1]
CONFIG_DIR = Path.home() / ".config" / "google-sheets-agent"
CREDENTIALS_PATH = CONFIG_DIR / "credentials.json"
REGISTRY_PATH = CONFIG_DIR / "registry.json"
BROWSER_PROFILE_DIR = CONFIG_DIR / "browser-profile"
BROWSER_STATE_PATH = CONFIG_DIR / "browser-auth.json"
USER_CLIENT_OVERRIDE = CONFIG_DIR / "client_secret.json"
BUNDLED_CLIENT = SKILL_DIR / "config" / "oauth-client.json"

SCOPES = [
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.projects",
    "https://www.googleapis.com/auth/script.deployments",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive.file",
]
OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
SCRIPT_RUN_URL = "https://script.googleapis.com/v1/scripts/{script_id}:run"
SIGNIN_TIMEOUT_SEC = 300
DEFAULT_PORT = 8765

SHEET_ACTIONS = {
    "read",
    "create",
    "update",
    "delete",
    "style",
    "comment",
    "listSheets",
    "createSheet",
    "renameSheet",
    "deleteSheet",
    "tabColor",
    "listTabs",
    "createTab",
    "renameTab",
    "deleteTab",
    "setTabColor",
}

DOC_ACTIONS = {
    "readDoc",
    "listDoc",
    "appendDoc",
    "insertDoc",
    "replaceDoc",
    "styleDoc",
    "deleteDoc",
    "commentDoc",
    "appendMarkdown",
    "renderMarkdown",
    "appendTable",
    "appendImage",
    "readDocComments",
    "listDocComments",
    "replyDocComment",
    "resolveDocComment",
    "uploadAndAppendImage",
    "listDocTabs",
    "createDocTab",
    "renameDocTab",
    "docRead",
    "docAppend",
    "docInsert",
    "docReplace",
    "docStyle",
    "docDelete",
    "docComment",
    "docReplyComment",
    "docResolveComment",
}

SLIDES_ACTIONS = {
    "listSlides",
    "getSlide",
    "createSlide",
    "duplicateSlide",
    "deleteSlide",
    "moveSlide",
    "replaceText",
    "appendTextBox",
    "insertImage",
    "setBackground",
    "copySlide",
}

DRIVE_UPLOAD_ACTIONS = {"uploadDriveFile", "shareDriveFile"}

ACTION_ALIASES = {
    "listTabs": "listSheets",
    "createTab": "createSheet",
    "renameTab": "renameSheet",
    "deleteTab": "deleteSheet",
    "setTabColor": "tabColor",
}

SUCCESS_HTML = b"""<!doctype html><html><body style="font-family:system-ui;margin:40px">
<h2>Connected to Google Sheets</h2><p>You can close this tab and return to the app.</p>
</body></html>"""

ERROR_HTML = b"""<!doctype html><html><body style="font-family:system-ui;margin:40px">
<h2>Sign-in failed</h2><p>Return to the app and try again.</p>
</body></html>"""


def load_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def resolve_client_config() -> dict:
    env_path = os.environ.get("GOOGLE_SHEETS_AGENT_CLIENT_SECRET")
    candidates = []
    if env_path:
        candidates.append(Path(env_path))
    if USER_CLIENT_OVERRIDE.exists():
        candidates.append(USER_CLIENT_OVERRIDE)
    if BUNDLED_CLIENT.exists():
        candidates.append(BUNDLED_CLIENT)

    for path in candidates:
        data = load_json(path)
        if data:
            client = data["installed"] if "installed" in data else data["web"]
            client["_source"] = str(path)
            return client

    sys.exit(
        "OAuth client not configured for end users.\n"
        "Ask your admin to ship config/oauth-client.json inside the skill (maintainer setup).\n"
        "See reference.md → Maintainer setup."
    )


def pick_port(preferred: int = DEFAULT_PORT) -> int:
    for port in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    sys.exit("No free localhost port for sign-in server (8765-8784).")


def run_signin_server(port: int, state: str) -> tuple[str | None, str | None]:
    code_holder: dict[str, str | None] = {"code": None, "error": None}
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != "/callback":
                self.send_error(404)
                return

            qs = urllib.parse.parse_qs(parsed.query)
            if qs.get("state", [None])[0] != state:
                code_holder["error"] = "state mismatch"
            elif "error" in qs:
                code_holder["error"] = qs["error"][0]
            else:
                code_holder["code"] = qs["code"][0]

            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(SUCCESS_HTML if code_holder["code"] else ERROR_HTML)
            done.set()

        def log_message(self, *_args):
            return

    server = HTTPServer(("127.0.0.1", port), Handler)
    server.timeout = 1.0
    deadline = time.time() + SIGNIN_TIMEOUT_SEC

    print(f"Waiting for Google sign-in on http://127.0.0.1:{port}/callback")
    print(f"Timeout in {SIGNIN_TIMEOUT_SEC // 60} minutes. Ctrl+C to cancel.")

    while not done.is_set() and time.time() < deadline:
        server.handle_request()

    server.server_close()
    return code_holder["code"], code_holder["error"]


def refresh_access_token(client: dict, creds: dict) -> dict:
    if creds.get("expires_at", 0) > int(time.time()) + 60:
        return creds

    body = urllib.parse.urlencode(
        {
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "refresh_token": creds["refresh_token"],
            "grant_type": "refresh_token",
        }
    ).encode()

    req = urllib.request.Request(OAUTH_TOKEN_URL, data=body, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        token = json.loads(resp.read().decode())

    creds["access_token"] = token["access_token"]
    creds["expires_at"] = int(time.time()) + int(token.get("expires_in", 3600))
    save_json(CREDENTIALS_PATH, creds)
    return creds


def require_oauth_creds() -> tuple[dict, dict]:
    if not oauth_client_ready():
        sys.exit(
            "OAuth client required for bootstrap.\n"
            "Maintainer: cp client_secret.json config/oauth-client.json\n"
            "Then: signin"
        )
    client = resolve_client_config()
    creds = load_json(CREDENTIALS_PATH)
    if not creds:
        sys.exit(f"Not signed in. Run: {sys.argv[0]} signin")
    return client, refresh_access_token(client, creds)


def cmd_bootstrap(args: argparse.Namespace) -> None:
    client, creds = require_oauth_creds()
    registry = load_registry()

    if args.presentation_url:
        parent_id = parse_presentation_id(args.presentation_url)
        resource = registry.get("presentations", {}).get(parent_id, {})
        label = args.label or resource.get("label") or "Slides Agent"
        deployment_id = args.deployment_id or (
            resource.get("latestDeploymentId") if args.update_only else None
        )
        result = bootstrap_script(
            creds["access_token"],
            parent_id=parent_id,
            script_id=args.script_id
            or (parse_script_id(args.script_ref) if args.script_ref else resource.get("scriptId")),
            label=label,
            deployment_id=deployment_id,
            create_project=args.create_project or not resource.get("scriptId"),
        )
        deployment = upsert_presentation_deployment(
            registry,
            presentation_id=parent_id,
            script_id=result["scriptId"],
            deployment_id=result["deploymentId"],
            web_app_url=result["webAppUrl"],
            label=label,
            domain=args.domain or resource.get("domain", ""),
            presentation_url=args.presentation_url,
        )
        save_registry(registry)
        print(json.dumps({**result, "presentationId": parent_id, "registered": True, "deployment": deployment}, indent=2))
        return

    if args.document_url:
        parent_id = parse_document_id(args.document_url)
        resource = registry.get("documents", {}).get(parent_id, {})
        label = args.label or resource.get("label") or "Docs Agent"
        deployment_id = args.deployment_id or (resource.get("latestDeploymentId") if args.update_only else None)
        result = bootstrap_script(
            creds["access_token"],
            parent_id=parent_id,
            script_id=args.script_id or (parse_script_id(args.script_ref) if args.script_ref else resource.get("scriptId")),
            label=label,
            deployment_id=deployment_id,
            create_project=args.create_project or not resource.get("scriptId"),
        )
        deployment = upsert_document_deployment(
            registry,
            document_id=parent_id,
            script_id=result["scriptId"],
            deployment_id=result["deploymentId"],
            web_app_url=result["webAppUrl"],
            label=label,
            domain=args.domain or resource.get("domain", "quintoandar.com.br"),
            document_url=args.document_url,
        )
        save_registry(registry)
        print(json.dumps({**result, "documentId": parent_id, "registered": True, "deployment": deployment}, indent=2))
        return

    spreadsheet_id = parse_spreadsheet_id(args.spreadsheet_url)
    sheet = registry.get("spreadsheets", {}).get(spreadsheet_id, {})
    script_id = args.script_id or (parse_script_id(args.script_ref) if args.script_ref else sheet.get("scriptId"))
    deployment_id = args.deployment_id or (sheet.get("latestDeploymentId") if args.update_only else None)

    result = bootstrap_script(
        creds["access_token"],
        parent_id=spreadsheet_id,
        script_id=script_id,
        label=args.label or sheet.get("label") or "Sheets Agent",
        deployment_id=deployment_id,
        create_project=args.create_project or not script_id,
    )

    deployment = upsert_spreadsheet_deployment(
        registry,
        spreadsheet_id=spreadsheet_id,
        script_id=result["scriptId"],
        deployment_id=result["deploymentId"],
        web_app_url=result["webAppUrl"],
        label=args.label or sheet.get("label") or spreadsheet_id,
        domain=args.domain or sheet.get("domain", "quintoandar.com.br"),
        spreadsheet_url=args.spreadsheet_url,
    )
    save_registry(registry)
    print(
        json.dumps(
            {
                **result,
                "spreadsheetId": spreadsheet_id,
                "registered": True,
                "deployment": deployment,
            },
            indent=2,
        )
    )


def cmd_signin(args: argparse.Namespace) -> None:
    client = resolve_client_config()
    port = pick_port(args.port)
    redirect_uri = f"http://127.0.0.1:{port}/callback"
    state = os.urandom(16).hex()

    params = {
        "client_id": client["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    auth_url = OAUTH_AUTH_URL + "?" + urllib.parse.urlencode(params)

    print("Opening browser for Google sign-in...")
    if not webbrowser.open(auth_url):
        print(f"If the browser did not open, visit:\n{auth_url}")

    code, error = run_signin_server(port, state)
    if error:
        sys.exit(f"OAuth failed: {error}")
    if not code:
        sys.exit("Sign-in timed out. Run signin again.")

    body = urllib.parse.urlencode(
        {
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
    ).encode()
    req = urllib.request.Request(OAUTH_TOKEN_URL, data=body, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        token = json.loads(resp.read().decode())

    if "refresh_token" not in token:
        sys.exit("No refresh_token returned. Revoke app access in Google Account and run signin again.")

    save_json(
        CREDENTIALS_PATH,
        {
            "access_token": token["access_token"],
            "refresh_token": token["refresh_token"],
            "expires_at": int(time.time()) + int(token.get("expires_in", 3600)),
            "scopes": SCOPES,
            "email_hint": args.email or "",
        },
    )
    print(f"Signed in. Credentials saved to {CREDENTIALS_PATH}")


def cmd_logout(_: argparse.Namespace) -> None:
    if CREDENTIALS_PATH.exists():
        CREDENTIALS_PATH.unlink()
    print("Signed out.")


def oauth_client_ready() -> bool:
    return BUNDLED_CLIENT.exists() or USER_CLIENT_OVERRIDE.exists() or bool(
        os.environ.get("GOOGLE_SHEETS_AGENT_CLIENT_SECRET")
    )


def browser_auth_ready() -> bool:
    return BROWSER_STATE_PATH.exists() or BROWSER_PROFILE_DIR.exists()


def encode_payload_param(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def build_browser_url(web_app_url: str, payload: dict) -> str:
    encoded = encode_payload_param(payload)
    separator = "&" if "?" in web_app_url else "?"
    return f"{web_app_url}{separator}p={urllib.parse.quote(encoded, safe='')}"


def parse_browser_response(text: str):
    text = text.strip()
    if not text:
        raise ValueError("Empty browser response")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        raise


def load_registry() -> dict:
    registry = load_json(
        REGISTRY_PATH,
        {"spreadsheets": {}, "documents": {}, "presentations": {}, "deployments": {}},
    )
    registry.setdefault("spreadsheets", {})
    registry.setdefault("documents", {})
    registry.setdefault("presentations", {})
    registry.setdefault("deployments", {})
    migrate_registry_(registry)
    return registry


def save_registry(registry: dict) -> None:
    save_json(REGISTRY_PATH, registry)


def migrate_registry_(registry: dict) -> None:
    """Upgrade legacy deployment-only registry to spreadsheet-centric layout."""
    for deployment_id, entry in list(registry.get("deployments", {}).items()):
        spreadsheet_id = entry.get("spreadsheetId")
        if not spreadsheet_id:
            continue
        sheet = registry["spreadsheets"].setdefault(
            spreadsheet_id,
            {
                "scriptId": entry.get("scriptId", ""),
                "label": entry.get("label", spreadsheet_id),
                "latestDeploymentId": deployment_id,
                "latestWebAppUrl": entry.get("webAppUrl", ""),
                "latestRegisteredAt": entry.get("registeredAt", 0),
                "deployments": {},
            },
        )
        sheet.setdefault("deployments", {})[deployment_id] = {
            "webAppUrl": entry.get("webAppUrl", ""),
            "registeredAt": entry.get("registeredAt", 0),
        }
        if entry.get("registeredAt", 0) >= sheet.get("latestRegisteredAt", 0):
            sheet["latestDeploymentId"] = deployment_id
            sheet["latestWebAppUrl"] = entry.get("webAppUrl", "")
            sheet["latestRegisteredAt"] = entry.get("registeredAt", 0)
            sheet["scriptId"] = entry.get("scriptId", sheet.get("scriptId", ""))
            sheet["label"] = entry.get("label", sheet.get("label", spreadsheet_id))

    for deployment_id, entry in list(registry.get("deployments", {}).items()):
        document_id = entry.get("documentId")
        if not document_id:
            continue
        registry.setdefault("documents", {})
        doc = registry["documents"].setdefault(
            document_id,
            {
                "scriptId": entry.get("scriptId", ""),
                "label": entry.get("label", document_id),
                "latestDeploymentId": deployment_id,
                "latestWebAppUrl": entry.get("webAppUrl", ""),
                "latestRegisteredAt": entry.get("registeredAt", 0),
                "deployments": {},
            },
        )
        doc.setdefault("deployments", {})[deployment_id] = {
            "webAppUrl": entry.get("webAppUrl", ""),
            "registeredAt": entry.get("registeredAt", 0),
        }
        if entry.get("registeredAt", 0) >= doc.get("latestRegisteredAt", 0):
            doc["latestDeploymentId"] = deployment_id
            doc["latestWebAppUrl"] = entry.get("webAppUrl", "")
            doc["latestRegisteredAt"] = entry.get("registeredAt", 0)
            doc["scriptId"] = entry.get("scriptId", doc.get("scriptId", ""))
            doc["label"] = entry.get("label", doc.get("label", document_id))


def upsert_document_deployment(
    registry: dict,
    *,
    document_id: str,
    script_id: str,
    deployment_id: str,
    web_app_url: str,
    label: str,
    domain: str,
    document_url: str,
) -> dict:
    now = int(time.time())
    doc = registry["documents"].setdefault(
        document_id,
        {
            "scriptId": script_id,
            "label": label or document_id,
            "domain": domain,
            "documentUrl": document_url,
            "latestDeploymentId": deployment_id,
            "latestWebAppUrl": web_app_url,
            "latestRegisteredAt": now,
            "deployments": {},
        },
    )
    doc["scriptId"] = script_id or doc.get("scriptId", "")
    doc["label"] = label or doc.get("label", document_id)
    doc["domain"] = domain or doc.get("domain", "quintoandar.com.br")
    if document_url:
        doc["documentUrl"] = document_url
    doc.setdefault("deployments", {})[deployment_id] = {"webAppUrl": web_app_url, "registeredAt": now}
    doc["latestDeploymentId"] = deployment_id
    doc["latestWebAppUrl"] = web_app_url
    doc["latestRegisteredAt"] = now

    deployment = {
        "documentId": document_id,
        "scriptId": doc["scriptId"],
        "label": doc["label"],
        "domain": doc.get("domain", "quintoandar.com.br"),
        "documentUrl": doc.get("documentUrl", ""),
        "webAppUrl": web_app_url,
        "registeredAt": now,
        "isLatest": True,
    }
    existing = registry.setdefault("deployments", {}).get(deployment_id, {})
    if existing.get("spreadsheetId"):
        deployment["spreadsheetId"] = existing["spreadsheetId"]
        deployment["spreadsheetUrl"] = existing.get("spreadsheetUrl", "")
    registry["deployments"][deployment_id] = deployment
    return deployment


def upsert_presentation_deployment(
    registry: dict,
    *,
    presentation_id: str,
    script_id: str,
    deployment_id: str,
    web_app_url: str,
    label: str,
    domain: str,
    presentation_url: str,
) -> dict:
    now = int(time.time())
    presentation = registry["presentations"].setdefault(
        presentation_id,
        {
            "scriptId": script_id,
            "label": label or presentation_id,
            "domain": domain,
            "presentationUrl": presentation_url,
            "latestDeploymentId": deployment_id,
            "latestWebAppUrl": web_app_url,
            "latestRegisteredAt": now,
            "deployments": {},
        },
    )
    presentation["scriptId"] = script_id or presentation.get("scriptId", "")
    presentation["label"] = label or presentation.get("label", presentation_id)
    presentation["domain"] = domain or presentation.get("domain", "")
    if presentation_url:
        presentation["presentationUrl"] = presentation_url
    presentation.setdefault("deployments", {})[deployment_id] = {
        "webAppUrl": web_app_url,
        "registeredAt": now,
    }
    presentation["latestDeploymentId"] = deployment_id
    presentation["latestWebAppUrl"] = web_app_url
    presentation["latestRegisteredAt"] = now
    deployment = {
        "presentationId": presentation_id,
        "scriptId": presentation["scriptId"],
        "label": presentation["label"],
        "domain": presentation["domain"],
        "presentationUrl": presentation.get("presentationUrl", ""),
        "webAppUrl": web_app_url,
        "registeredAt": now,
        "isLatest": True,
    }
    registry.setdefault("deployments", {})[deployment_id] = deployment
    return deployment


def upsert_spreadsheet_deployment(
    registry: dict,
    *,
    spreadsheet_id: str,
    script_id: str,
    deployment_id: str,
    web_app_url: str,
    label: str,
    domain: str,
    spreadsheet_url: str,
) -> dict:
    now = int(time.time())
    sheet = registry["spreadsheets"].setdefault(
        spreadsheet_id,
        {
            "scriptId": script_id,
            "label": label or spreadsheet_id,
            "domain": domain,
            "spreadsheetUrl": spreadsheet_url,
            "latestDeploymentId": deployment_id,
            "latestWebAppUrl": web_app_url,
            "latestRegisteredAt": now,
            "deployments": {},
        },
    )

    sheet["scriptId"] = script_id or sheet.get("scriptId", "")
    sheet["label"] = label or sheet.get("label", spreadsheet_id)
    sheet["domain"] = domain or sheet.get("domain", "quintoandar.com.br")
    if spreadsheet_url:
        sheet["spreadsheetUrl"] = spreadsheet_url
    sheet.setdefault("deployments", {})[deployment_id] = {
        "webAppUrl": web_app_url,
        "registeredAt": now,
    }
    sheet["latestDeploymentId"] = deployment_id
    sheet["latestWebAppUrl"] = web_app_url
    sheet["latestRegisteredAt"] = now

    deployment = {
        "spreadsheetId": spreadsheet_id,
        "scriptId": sheet["scriptId"],
        "label": sheet["label"],
        "domain": sheet.get("domain", "quintoandar.com.br"),
        "spreadsheetUrl": sheet.get("spreadsheetUrl", ""),
        "webAppUrl": web_app_url,
        "registeredAt": now,
        "isLatest": True,
    }
    existing = registry.setdefault("deployments", {}).get(deployment_id, {})
    if existing.get("documentId"):
        deployment["documentId"] = existing["documentId"]
        deployment["documentUrl"] = existing.get("documentUrl", "")
    registry["deployments"][deployment_id] = deployment
    return deployment


def resolve_deployment(registry: dict, args: argparse.Namespace) -> tuple[str, dict]:
    """Pick deployment id + entry. Defaults to latest deployment for a spreadsheet or document."""
    if getattr(args, "deployment_id", None):
        deployment_id = args.deployment_id.strip()
        deployment = registry.get("deployments", {}).get(deployment_id)
        if deployment:
            return deployment_id, deployment
        sys.exit(f"Unknown deployment_id: {deployment_id}")

    if getattr(args, "web_app_url", None):
        deployment_id = parse_deployment_id(args.web_app_url)
        deployment = registry.get("deployments", {}).get(deployment_id)
        if deployment:
            return deployment_id, deployment

    presentation_id = None
    if getattr(args, "presentation_id", None):
        presentation_id = args.presentation_id
    elif getattr(args, "presentation_url", None):
        presentation_id = parse_presentation_id(args.presentation_url)

    if presentation_id:
        presentation = registry.get("presentations", {}).get(presentation_id)
        if not presentation or not presentation.get("latestDeploymentId"):
            sys.exit(f"No deployment registered for presentation {presentation_id}")
        deployment_id = presentation["latestDeploymentId"]
        base = registry["deployments"].get(deployment_id) or {}
        return deployment_id, {
            **base,
            "presentationId": presentation_id,
            "scriptId": base.get("scriptId") or presentation.get("scriptId", ""),
            "label": base.get("label") or presentation.get("label", presentation_id),
            "webAppUrl": base.get("webAppUrl") or presentation.get("latestWebAppUrl", ""),
            "presentationUrl": base.get("presentationUrl") or presentation.get("presentationUrl", ""),
        }

    document_id = None
    if getattr(args, "document_id", None):
        document_id = args.document_id
    elif getattr(args, "document_url", None):
        document_id = parse_document_id(args.document_url)

    if document_id:
        doc = registry.get("documents", {}).get(document_id)
        if not doc or not doc.get("latestDeploymentId"):
            sys.exit(f"No deployment registered for document {document_id}")
        deployment_id = doc["latestDeploymentId"]
        base = registry["deployments"].get(deployment_id) or {}
        deployment = {
            **base,
            "documentId": document_id,
            "scriptId": base.get("scriptId") or doc.get("scriptId", ""),
            "label": base.get("label") or doc.get("label", document_id),
            "webAppUrl": base.get("webAppUrl") or doc.get("latestWebAppUrl", ""),
            "documentUrl": base.get("documentUrl") or doc.get("documentUrl", ""),
        }
        return deployment_id, deployment

    spreadsheet_id = None
    if getattr(args, "spreadsheet_id", None):
        spreadsheet_id = args.spreadsheet_id
    elif getattr(args, "spreadsheet_url", None):
        spreadsheet_id = parse_spreadsheet_id(args.spreadsheet_url)

    if spreadsheet_id:
        sheet = registry.get("spreadsheets", {}).get(spreadsheet_id)
        if not sheet or not sheet.get("latestDeploymentId"):
            sys.exit(f"No deployment registered for spreadsheet {spreadsheet_id}")
        deployment_id = sheet["latestDeploymentId"]
        deployment = registry["deployments"].get(deployment_id)
        if not deployment:
            deployment = {
                "spreadsheetId": spreadsheet_id,
                "scriptId": sheet.get("scriptId", ""),
                "label": sheet.get("label", spreadsheet_id),
                "webAppUrl": sheet.get("latestWebAppUrl", ""),
                "spreadsheetUrl": sheet.get("spreadsheetUrl", ""),
            }
        return deployment_id, deployment

    spreadsheets = registry.get("spreadsheets", {})
    documents = registry.get("documents", {})
    presentations = registry.get("presentations", {})
    if len(spreadsheets) + len(documents) + len(presentations) == 1:
        if len(presentations) == 1:
            presentation_id, presentation = next(iter(presentations.items()))
            deployment_id = presentation.get("latestDeploymentId")
            if deployment_id:
                return deployment_id, registry.get("deployments", {}).get(deployment_id) or {
                    "presentationId": presentation_id,
                    "scriptId": presentation.get("scriptId", ""),
                    "label": presentation.get("label", ""),
                    "webAppUrl": presentation.get("latestWebAppUrl", ""),
                    "presentationUrl": presentation.get("presentationUrl", ""),
                }
        if len(documents) == 1:
            doc = next(iter(documents.values()))
            document_id = next(iter(documents.keys()))
            deployment_id = doc.get("latestDeploymentId")
            if deployment_id:
                deployment = registry.get("deployments", {}).get(deployment_id) or {
                    "documentId": document_id,
                    "scriptId": doc.get("scriptId", ""),
                    "label": doc.get("label", ""),
                    "webAppUrl": doc.get("latestWebAppUrl", ""),
                    "documentUrl": doc.get("documentUrl", ""),
                }
                return deployment_id, deployment
        sheet = next(iter(spreadsheets.values()))
        deployment_id = sheet.get("latestDeploymentId")
        if deployment_id:
            deployment = registry.get("deployments", {}).get(deployment_id) or {
                "spreadsheetId": next(iter(spreadsheets.keys())),
                "scriptId": sheet.get("scriptId", ""),
                "label": sheet.get("label", ""),
                "webAppUrl": sheet.get("latestWebAppUrl", ""),
                "spreadsheetUrl": sheet.get("spreadsheetUrl", ""),
            }
            return deployment_id, deployment

    sys.exit(
        "Could not resolve deployment. Provide --spreadsheet-url, --document-url, --presentation-url, or --deployment-id.\n"
        "If you redeployed, run register with the new web app URL."
    )


def normalize_action(action: str) -> str:
    action = (action or "").strip()
    return ACTION_ALIASES.get(action, action)


def payload_uses_sheet_actions(payload: dict) -> bool:
    action = normalize_action(payload.get("action", ""))
    if action == "batch":
        ops = payload.get("ops") or []
        if not ops:
            return False
        return all(
            normalize_action(op.get("action", "")) in SHEET_ACTIONS
            for op in ops
            if isinstance(op, dict)
        )
    return action in SHEET_ACTIONS


def payload_uses_doc_actions(payload: dict) -> bool:
    action = normalize_action(payload.get("action", ""))
    if action == "batch":
        ops = payload.get("ops") or []
        if not ops:
            return False
        return any(
            normalize_action(op.get("action", "")) in DOC_ACTIONS
            for op in ops
            if isinstance(op, dict)
        )
    return action in DOC_ACTIONS


def payload_uses_slides_actions(payload: dict) -> bool:
    action = normalize_action(payload.get("action", ""))
    if action == "batch":
        ops = payload.get("ops") or []
        return bool(ops) and all(
            normalize_action(op.get("action", "")) in SLIDES_ACTIONS
            for op in ops
            if isinstance(op, dict)
        )
    return action in SLIDES_ACTIONS


def resolve_call_payload(args: argparse.Namespace, deployment: dict) -> dict:
    if args.payload_file:
        payload = json.loads(Path(args.payload_file).read_text())
    elif args.payload:
        payload = json.loads(args.payload)
    else:
        payload = {"action": args.action}
        if args.range:
            payload["range"] = args.range
        if args.value is not None:
            payload["value"] = args.value
        if args.sheet_name:
            payload["sheetName"] = args.sheet_name

    payload["action"] = normalize_action(payload.get("action", ""))
    if payload.get("ops"):
        payload["ops"] = [
            {**op, "action": normalize_action(op.get("action", ""))}
            if isinstance(op, dict)
            else op
            for op in payload["ops"]
        ]

    sheet_action = payload_uses_sheet_actions(payload)
    doc_action = payload_uses_doc_actions(payload)
    slides_action = payload_uses_slides_actions(payload)
    drive_action = normalize_action(payload.get("action", "")) in DRIVE_UPLOAD_ACTIONS

    if slides_action and not sheet_action and not doc_action:
        if getattr(args, "presentation_url", None):
            payload.setdefault("presentationId", parse_presentation_id(args.presentation_url))
        elif getattr(args, "presentation_id", None):
            payload.setdefault("presentationId", args.presentation_id)
        elif deployment.get("presentationId"):
            payload.setdefault("presentationId", deployment["presentationId"])

    if doc_action and not sheet_action:
        if getattr(args, "document_url", None):
            payload.setdefault("documentId", parse_document_id(args.document_url))
        elif getattr(args, "document_id", None):
            payload.setdefault("documentId", args.document_id)
        elif deployment.get("documentId"):
            payload.setdefault("documentId", deployment["documentId"])

    if sheet_action and not doc_action:
        if getattr(args, "spreadsheet_url", None):
            payload.setdefault("spreadsheetId", parse_spreadsheet_id(args.spreadsheet_url))
        elif getattr(args, "spreadsheet_id", None):
            payload.setdefault("spreadsheetId", args.spreadsheet_id)
        elif deployment.get("spreadsheetId"):
            payload.setdefault("spreadsheetId", deployment["spreadsheetId"])
    elif not doc_action and not drive_action and deployment.get("spreadsheetId"):
        payload.setdefault("spreadsheetId", deployment["spreadsheetId"])

    return normalize_call_payload(payload)


def detect_agent_host() -> str:
    if os.environ.get("CURSOR_AGENT") == "1" or os.environ.get("CURSOR_TRACE_ID"):
        return "cursor"
    if os.environ.get("CLAUDE_CODE") or os.environ.get("CLAUDE_SESSION"):
        return "claude"
    return "cursor"


def normalize_call_payload(payload: dict) -> dict:
    action = payload.get("action", "")
    if action == "copySlide" and payload.get("sourcePresentationUrl"):
        payload.setdefault("sourcePresentationId", parse_presentation_id(payload["sourcePresentationUrl"]))
    if action in ("replyDocComment", "docReplyComment"):
        payload.setdefault("host", detect_agent_host())
    if action == "batch":
        for op in payload.get("ops") or []:
            if isinstance(op, dict) and op.get("action") in ("replyDocComment", "docReplyComment"):
                op.setdefault("host", detect_agent_host())
    return payload


def require_playwright():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as err:
        raise SystemExit(
            "Playwright is required for browser mode.\n"
            "Install: pip3 install playwright && python3 -m playwright install chromium"
        ) from err
    return sync_playwright


def _browser_body_is_login_page(text: str, url: str = "") -> bool:
    lower = text.lower()
    if "accounts.google.com" in url:
        return True
    return any(
        marker in lower
        for marker in (
            "sign in - google accounts",
            "verify it's you",
            "verify it’s you",
            "fazer login",
            "sign in to continue",
        )
    )


def _browser_body_is_error_page(text: str) -> bool:
    lower = text.lower()
    return "página não encontrada" in lower or "page not found" in lower or "<title>error" in lower


def payload_requires_post(payload: dict) -> bool:
    action = normalize_action(payload.get("action", ""))
    return action in {"uploadDriveFile", "uploadAndAppendImage"}


def run_browser_post(web_app_url: str, payload: dict, *, headless: bool) -> str:
    sync_playwright = require_playwright()
    body_json = json.dumps({"payload": payload}, ensure_ascii=False)

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(BROWSER_PROFILE_DIR),
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = context.pages[0] if context.pages else context.new_page()

        if payload_requires_post(payload) or len(body_json) > 7000:
            response = context.request.post(
                web_app_url,
                data=body_json,
                headers={"Content-Type": "application/json"},
                timeout=120_000,
            )
            if response.status >= 400:
                context.close()
                sys.exit(f"Web app POST failed ({response.status}): {response.text()[:2000]}")
            body_text = response.text()
            current_url = web_app_url
        else:
            call_url = build_browser_url(web_app_url, payload)
            page.goto(call_url, wait_until="domcontentloaded", timeout=120_000)
            page.wait_for_timeout(1500)
            current_url = page.url
            body_text = page.locator("body").inner_text(timeout=30_000)

        context.close()

        if _browser_body_is_login_page(body_text, current_url):
            sys.exit(
                "Google login required. Run:\n"
                f"  {sys.argv[0]} browser-auth"
            )
        if _browser_body_is_error_page(body_text):
            sys.exit(
                "Web app returned not found. Redeploy Apps Script, then:\n"
                f"  {sys.argv[0]} register --spreadsheet-url ... --web-app-url NEW_URL"
            )
        return body_text


def run_browser_session(url: str, *, headless: bool, wait_seconds: int) -> str:
    sync_playwright = require_playwright()
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(BROWSER_PROFILE_DIR),
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=120_000)
        page.wait_for_timeout(wait_seconds * 1000)

        current_url = page.url
        if "accounts.google.com" in current_url:
            context.close()
            sys.exit(
                "Google login required. Run:\n"
                f"  {sys.argv[0]} browser-auth"
            )

        body_text = page.locator("body").inner_text(timeout=30_000)
        context.close()
        return body_text


def cmd_browser_auth(args: argparse.Namespace) -> None:
    sync_playwright = require_playwright()
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    login_url = args.url or "https://accounts.google.com/"
    print("Opening browser for Google sign-in...")
    print("Log in with the same account used to deploy the Apps Script web app.")
    print("When you see your Google account home, return here.")

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(BROWSER_PROFILE_DIR),
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(login_url, wait_until="domcontentloaded", timeout=120_000)

        deadline = time.time() + args.timeout
        while time.time() < deadline:
            current_url = page.url
            if "accounts.google.com" not in current_url and "ServiceLogin" not in current_url:
                break
            page.wait_for_timeout(1000)
        else:
            context.close()
            sys.exit("Timed out waiting for Google sign-in.")

        context.close()

    save_json(
        BROWSER_STATE_PATH,
        {
            "ready": True,
            "signed_in_at": int(time.time()),
            "login_url": login_url,
        },
    )
    print(f"Browser session saved to {BROWSER_PROFILE_DIR}")


def cmd_browser_url(args: argparse.Namespace) -> None:
    registry = load_registry()
    deployment_id, deployment = resolve_deployment(registry, args)

    payload = resolve_call_payload(args, deployment)
    web_app_url = deployment.get("webAppUrl")
    if not web_app_url:
        sys.exit("Deployment is missing webAppUrl. Re-run register with --web-app-url.")

    url = build_browser_url(web_app_url, payload)
    print(json.dumps({"deploymentId": deployment_id, "url": url, "payload": payload}, indent=2))


def cmd_call_browser(args: argparse.Namespace) -> None:
    registry = load_registry()
    deployment_id, deployment = resolve_deployment(registry, args)

    payload = resolve_call_payload(args, deployment)
    web_app_url = deployment.get("webAppUrl")
    if not web_app_url:
        sys.exit("Deployment is missing webAppUrl. Re-run register with --web-app-url.")

    body_text = run_browser_post(
        web_app_url,
        payload,
        headless=not args.show_browser,
    )

    try:
        result = parse_browser_response(body_text)
    except ValueError as err:
        sys.exit(f"Could not parse browser response: {err}\nRaw body:\n{body_text[:2000]}")

    if isinstance(result, dict) and result.get("error"):
        print(json.dumps(result, indent=2))
        sys.exit(1)

    print(json.dumps({"deploymentId": deployment_id, "result": result}, indent=2))


def clasp_logged_in() -> bool:
    try:
        proc = subprocess.run(
            ["npx", "--yes", "@google/clasp@2.4.2", "login", "--status"],
            capture_output=True,
            text=True,
            timeout=90,
        )
        combined = (proc.stdout + proc.stderr).lower()
        return "not logged in" not in combined and proc.returncode == 0
    except (subprocess.TimeoutExpired, OSError):
        return False


def playwright_ready() -> bool:
    try:
        import playwright  # noqa: F401
    except ImportError:
        return False
    return True


def is_document_registered(registry: dict, document_id: str) -> bool:
    doc = registry.get("documents", {}).get(document_id)
    if not doc:
        return False
    dep_id = doc.get("latestDeploymentId")
    return bool(dep_id and registry.get("deployments", {}).get(dep_id))


def is_presentation_registered(registry: dict, presentation_id: str) -> bool:
    presentation = registry.get("presentations", {}).get(presentation_id)
    if not presentation:
        return False
    dep_id = presentation.get("latestDeploymentId")
    return bool(dep_id and registry.get("deployments", {}).get(dep_id))


def is_spreadsheet_registered(registry: dict, spreadsheet_id: str) -> bool:
    sheet = registry.get("spreadsheets", {}).get(spreadsheet_id)
    if not sheet:
        return False
    dep_id = sheet.get("latestDeploymentId")
    return bool(dep_id and registry.get("deployments", {}).get(dep_id))


def cmd_setup(args: argparse.Namespace) -> None:
    setup_sh = SKILL_DIR / "scripts" / "setup.sh"
    if args.install:
        if not setup_sh.is_file():
            sys.exit(f"Setup script not found: {setup_sh}")
        subprocess.run(["bash", str(setup_sh)], check=True)

    report = {
        "python3": shutil.which("python3") is not None,
        "playwright": playwright_ready(),
        "skill_dir": str(SKILL_DIR),
        "skill_present": (SKILL_DIR / "SKILL.md").exists(),
        "clasp_logged_in": clasp_logged_in(),
        "browser_ready": browser_auth_ready(),
        "oauth_client_ready": oauth_client_ready(),
        "ready": playwright_ready() and (SKILL_DIR / "SKILL.md").exists(),
    }
    print(json.dumps(report, indent=2))
    if not report["ready"] and not args.install:
        sys.exit(1)


def cmd_status(args: argparse.Namespace) -> None:
    creds = load_json(CREDENTIALS_PATH)
    registry = load_registry()
    browser_state = load_json(BROWSER_STATE_PATH, {})
    sheets = []
    for spreadsheet_id, sheet in registry.get("spreadsheets", {}).items():
        sheets.append(
            {
                "spreadsheetId": spreadsheet_id,
                "label": sheet.get("label", spreadsheet_id),
                "latestDeploymentId": sheet.get("latestDeploymentId"),
                "deploymentsCount": len(sheet.get("deployments", {})),
            }
        )
    documents = []
    for document_id, doc in registry.get("documents", {}).items():
        documents.append(
            {
                "documentId": document_id,
                "label": doc.get("label", document_id),
                "latestDeploymentId": doc.get("latestDeploymentId"),
                "deploymentsCount": len(doc.get("deployments", {})),
            }
        )
    presentations = []
    for presentation_id, presentation in registry.get("presentations", {}).items():
        presentations.append(
            {
                "presentationId": presentation_id,
                "label": presentation.get("label", presentation_id),
                "latestDeploymentId": presentation.get("latestDeploymentId"),
                "deploymentsCount": len(presentation.get("deployments", {})),
            }
        )
    payload = {
        "mode": "browser" if browser_auth_ready() else ("oauth" if creds else "unset"),
        "browser_ready": browser_auth_ready(),
        "signed_in": bool(creds),
        "oauth_client_ready": oauth_client_ready(),
        "clasp_logged_in": clasp_logged_in(),
        "playwright_ready": playwright_ready(),
        "skill_ready": (SKILL_DIR / "SKILL.md").exists(),
        "spreadsheets": sheets,
        "documents": documents,
        "presentations": presentations,
        "browser_signed_in_at": browser_state.get("signed_in_at"),
    }
    if getattr(args, "presentation_url", None):
        try:
            presentation_id = parse_presentation_id(args.presentation_url)
            payload["presentationId"] = presentation_id
            payload["resourceType"] = "presentation"
            payload["registered"] = is_presentation_registered(registry, presentation_id)
            presentation = registry.get("presentations", {}).get(presentation_id, {})
            if presentation:
                payload["label"] = presentation.get("label")
                payload["scriptId"] = presentation.get("scriptId")
        except ValueError as err:
            payload["presentation_error"] = str(err)
            payload["registered"] = False
    elif getattr(args, "document_url", None):
        try:
            document_id = parse_document_id(args.document_url)
            payload["documentId"] = document_id
            payload["resourceType"] = "document"
            payload["registered"] = is_document_registered(registry, document_id)
            doc = registry.get("documents", {}).get(document_id, {})
            if doc:
                payload["label"] = doc.get("label")
                payload["scriptId"] = doc.get("scriptId")
        except ValueError as err:
            payload["document_error"] = str(err)
            payload["registered"] = False
    elif getattr(args, "spreadsheet_url", None):
        try:
            spreadsheet_id = parse_spreadsheet_id(args.spreadsheet_url)
            payload["spreadsheetId"] = spreadsheet_id
            payload["resourceType"] = "spreadsheet"
            payload["registered"] = is_spreadsheet_registered(registry, spreadsheet_id)
            sheet = registry.get("spreadsheets", {}).get(spreadsheet_id, {})
            if sheet:
                payload["label"] = sheet.get("label")
                payload["scriptId"] = sheet.get("scriptId")
        except ValueError as err:
            payload["spreadsheet_error"] = str(err)
            payload["registered"] = False
    print(json.dumps(payload, indent=2))


def parse_document_id(value: str) -> str:
    value = value.strip()
    match = re.search(r"/document/d/([a-zA-Z0-9-_]+)", value)
    if match:
        return match.group(1)
    if re.fullmatch(r"[a-zA-Z0-9-_]{20,}", value):
        return value
    raise ValueError(f"Could not parse document id from: {value}")


def parse_presentation_id(value: str) -> str:
    value = value.strip()
    match = re.search(r"/presentation/d/([a-zA-Z0-9-_]+)", value)
    if match:
        return match.group(1)
    if re.fullmatch(r"[a-zA-Z0-9-_]{20,}", value):
        return value
    raise ValueError(f"Could not parse presentation id from: {value}")


def parse_spreadsheet_id(value: str) -> str:
    value = value.strip()
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", value)
    if match:
        return match.group(1)
    if re.fullmatch(r"[a-zA-Z0-9-_]{20,}", value):
        return value
    raise ValueError(f"Could not parse spreadsheet id from: {value}")


def parse_deployment_id(value: str) -> str:
    value = value.strip()
    match = re.search(r"/s/([a-zA-Z0-9-_]+)/exec", value)
    if match:
        return match.group(1)
    if re.fullmatch(r"AKfycb[a-zA-Z0-9-_]+", value):
        return value
    raise ValueError(f"Could not parse deployment id from: {value}")


def parse_script_id(value: str) -> str:
    value = value.strip()
    match = re.search(r"/projects/([a-zA-Z0-9-_]+)", value)
    if match:
        return match.group(1)
    if re.fullmatch(r"[a-zA-Z0-9-_]{20,}", value):
        return value
    raise ValueError(f"Could not parse script id from: {value}")


def cmd_parse(args: argparse.Namespace) -> None:
    result = {}
    if args.spreadsheet:
        result["spreadsheetId"] = parse_spreadsheet_id(args.spreadsheet)
    if args.document:
        result["documentId"] = parse_document_id(args.document)
    if args.presentation:
        result["presentationId"] = parse_presentation_id(args.presentation)
    if args.web_app:
        result["deploymentId"] = parse_deployment_id(args.web_app)
    if args.script:
        result["scriptId"] = parse_script_id(args.script)
    print(json.dumps(result, indent=2))


def cmd_register(args: argparse.Namespace) -> None:
    registry = load_registry()
    web_app_url = args.web_app_url or ""
    deployment_id = (args.deployment_id or parse_deployment_id(web_app_url)).strip() if (args.deployment_id or web_app_url) else ""

    if args.presentation_url or args.presentation_id:
        presentation_id = args.presentation_id or parse_presentation_id(args.presentation_url)
        existing = registry.get("presentations", {}).get(presentation_id, {})
        script_id = args.script_id or (
            parse_script_id(args.script_ref) if args.script_ref else existing.get("scriptId", "")
        )
        if not script_id:
            sys.exit("script id/ref is required on first register for this presentation")
        if not deployment_id or not web_app_url:
            sys.exit("web app url or deployment id is required")
        deployment = upsert_presentation_deployment(
            registry,
            presentation_id=presentation_id,
            script_id=script_id,
            deployment_id=deployment_id,
            web_app_url=web_app_url,
            label=args.label or existing.get("label", presentation_id),
            domain=args.domain or existing.get("domain", ""),
            presentation_url=args.presentation_url or existing.get("presentationUrl", ""),
        )
        save_registry(registry)
        print(json.dumps({"latestDeploymentId": deployment_id, **deployment}, indent=2))
        return

    if args.document_url or args.document_id:
        document_id = args.document_id or parse_document_id(args.document_url)
        existing = registry.get("documents", {}).get(document_id, {})
        script_id = args.script_id or (parse_script_id(args.script_ref) if args.script_ref else existing.get("scriptId", ""))
        if not script_id:
            sys.exit("script id/ref is required on first register for this document")
        if not deployment_id or not web_app_url:
            sys.exit("web app url or deployment id is required")
        deployment = upsert_document_deployment(
            registry,
            document_id=document_id,
            script_id=script_id,
            deployment_id=deployment_id,
            web_app_url=web_app_url,
            label=args.label or existing.get("label", document_id),
            domain=args.domain or existing.get("domain", "quintoandar.com.br"),
            document_url=args.document_url or existing.get("documentUrl", ""),
        )
        save_registry(registry)
        print(json.dumps({"latestDeploymentId": deployment_id, **deployment}, indent=2))
        return

    spreadsheet_id = args.spreadsheet_id or parse_spreadsheet_id(args.spreadsheet_url)
    web_app_url = args.web_app_url or ""
    deployment_id = (args.deployment_id or parse_deployment_id(web_app_url)).strip() if (args.deployment_id or web_app_url) else ""

    existing = registry.get("spreadsheets", {}).get(spreadsheet_id, {})
    script_id = args.script_id or (parse_script_id(args.script_ref) if args.script_ref else existing.get("scriptId", ""))
    if not script_id:
        sys.exit("script id/ref is required on first register for this spreadsheet")
    if not deployment_id or not web_app_url:
        sys.exit("web app url or deployment id is required")

    deployment = upsert_spreadsheet_deployment(
        registry,
        spreadsheet_id=spreadsheet_id,
        script_id=script_id,
        deployment_id=deployment_id,
        web_app_url=web_app_url,
        label=args.label or existing.get("label", spreadsheet_id),
        domain=args.domain or existing.get("domain", "quintoandar.com.br"),
        spreadsheet_url=args.spreadsheet_url or existing.get("spreadsheetUrl", ""),
    )
    save_registry(registry)
    print(json.dumps({"latestDeploymentId": deployment_id, **deployment}, indent=2))


def build_upload_payload(path: Path, args: argparse.Namespace) -> dict:
    data = path.read_bytes()
    mime_type, _ = mimetypes.guess_type(str(path))
    mime_type = mime_type or "application/octet-stream"
    payload = {
        "base64": base64.b64encode(data).decode("ascii"),
        "fileName": path.name,
        "mimeType": mime_type,
        "shareDomain": args.share_domain or "quintoandar.com.br",
        "shareRole": getattr(args, "share_role", None) or "reader",
    }
    if getattr(args, "folder_id", None):
        payload["folderId"] = args.folder_id
    if args.append:
        payload["action"] = "uploadAndAppendImage"
        payload["alt"] = args.alt or path.stem
        if args.max_width:
            payload["maxWidth"] = int(args.max_width)
    else:
        payload["action"] = "uploadDriveFile"
    return payload


def cmd_upload(args: argparse.Namespace) -> None:
    path = Path(args.file).expanduser().resolve()
    if not path.is_file():
        sys.exit(f"File not found: {path}")
    if args.append and not (args.document_url or args.document_id):
        sys.exit("upload --append requires --document-url (or --document-id)")

    args.mode = "browser"
    args.payload = json.dumps(build_upload_payload(path, args))
    args.payload_file = None
    cmd_call_browser(args)


def cmd_canvas_export(args: argparse.Namespace) -> None:
    """Thin wrapper around the standalone canvas_export package (no Google coupling)."""
    from canvas_export.cli import run

    argv = ["--manifest", args.manifest]
    if args.out:
        argv.extend(["--out", args.out])
    if args.json:
        argv.append("--json")
    sys.exit(run(argv))


def cmd_call(args: argparse.Namespace) -> None:
    if args.mode == "browser":
        cmd_call_browser(args)
        return

    registry = load_registry()
    deployment_id, deployment = resolve_deployment(registry, args)

    payload = resolve_call_payload(args, deployment)

    client = resolve_client_config()
    creds = load_json(CREDENTIALS_PATH)
    if not creds:
        sys.exit(f"Not signed in. Run: {sys.argv[0]} signin")

    creds = refresh_access_token(client, creds)
    script_id = deployment["scriptId"]
    use_dev_mode = not args.no_dev_mode
    body = json.dumps(
        {
            "function": "runApi",
            "parameters": [json.dumps(payload)],
            "devMode": use_dev_mode,
        }
    ).encode()

    url = SCRIPT_RUN_URL.format(script_id=script_id)
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {creds['access_token']}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as err:
        sys.exit(err.read().decode())

    if result.get("error"):
        print(json.dumps(result, indent=2))
        sys.exit(1)

    response = result.get("response", {})
    if "result" in response:
        print(json.dumps(response["result"], indent=2))
        return

    print(json.dumps(response, indent=2))


def run_editor_authorize(script_id: str, *, wait_seconds: int = 20) -> bool:
    """Select authorizeWorkspace in Apps Script editor, run, accept OAuth if prompted."""
    sync_playwright = require_playwright()
    url = f"https://script.google.com/home/projects/{script_id}/edit"

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(BROWSER_PROFILE_DIR),
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=120_000)
        page.wait_for_timeout(8_000)
        page.get_by_text("Code.gs", exact=True).first.click()
        page.wait_for_timeout(2_000)

        page.locator("span").filter(has_text="runApi").nth(1).click()
        page.wait_for_timeout(1_500)
        page.get_by_role("option", name="authorizeWorkspace").click()
        page.wait_for_timeout(1_500)
        page.locator('[aria-label="Run the selected function"]').click()
        page.wait_for_timeout(wait_seconds * 1000)

        for pg in context.pages:
            for label in ("Review permissions", "Allow", "Permitir", "Autorizar", "Continue"):
                try:
                    btn = pg.get_by_role("button", name=label)
                    if btn.count():
                        btn.first.click()
                        pg.wait_for_timeout(8_000)
                except Exception:
                    pass

        body = page.locator("body").inner_text()
        context.close()
        return "Workspace scopes authorized" in body or "Execution completed" in body


def cmd_authorize(args: argparse.Namespace) -> None:
    """Open Apps Script editor so deployer can run authorizeWorkspace once (Workspace scopes)."""
    registry = load_registry()
    script_id = getattr(args, "script_id", None)

    if not script_id:
        if args.presentation_url:
            presentation = registry.get("presentations", {}).get(parse_presentation_id(args.presentation_url), {})
            script_id = presentation.get("scriptId")
        elif args.document_url:
            doc = registry.get("documents", {}).get(parse_document_id(args.document_url), {})
            script_id = doc.get("scriptId")
        elif args.spreadsheet_url:
            sheet = registry.get("spreadsheets", {}).get(parse_spreadsheet_id(args.spreadsheet_url), {})
            script_id = sheet.get("scriptId")
        elif args.presentation_id:
            script_id = registry.get("presentations", {}).get(args.presentation_id, {}).get("scriptId")
        elif args.document_id:
            script_id = registry.get("documents", {}).get(args.document_id, {}).get("scriptId")
        elif args.spreadsheet_id:
            script_id = registry.get("spreadsheets", {}).get(args.spreadsheet_id, {}).get("scriptId")

    if not script_id and args.script_ref:
        script_id = parse_script_id(args.script_ref)

    if not script_id:
        sys.exit(
            "authorize needs --script-id, --script-ref, or a registered resource URL"
        )

    editor_url = f"https://script.google.com/d/{script_id}/edit"
    print("After upgrading the Workspace script, run authorizeWorkspace once in Apps Script:")
    print(f"  1. Open: {editor_url}")
    print("  2. Select function authorizeWorkspace in the toolbar")
    print("  3. Click Run → Review permissions → Allow")
    print("  4. Retry your Docs call")

    if getattr(args, "auto", False):
        print("\nRunning authorizeWorkspace automatically in Apps Script editor...")
        if run_editor_authorize(script_id, wait_seconds=args.wait):
            print("Workspace scopes authorized.")
        else:
            print("Could not confirm authorization — complete steps manually if Docs calls still fail.")
        return

    if args.open_browser:
        webbrowser.open(editor_url)
        return

    try:
        run_browser_session(editor_url, headless=False, wait_seconds=args.wait)
    except SystemExit:
        print(f"\nOpen manually: {editor_url}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Google Workspace Apps Script agent")
    sub = parser.add_subparsers(dest="command", required=True)

    signin = sub.add_parser("signin", help="Sign in with Google OAuth (requires client secret)")
    signin.add_argument("--port", type=int, default=DEFAULT_PORT)
    signin.add_argument("--email", help="Optional Workspace email hint")

    browser_auth = sub.add_parser("browser-auth", help="Sign in with Google via persistent browser profile")
    browser_auth.add_argument("--url", default="https://accounts.google.com/")
    browser_auth.add_argument("--timeout", type=int, default=SIGNIN_TIMEOUT_SEC)

    browser_url = sub.add_parser("browser-url", help="Build a browser-callable web app URL")
    add_target_args(browser_url)
    browser_url.add_argument("--action", default="read")
    browser_url.add_argument("--range")
    browser_url.add_argument("--value")
    browser_url.add_argument("--sheet-name")
    browser_url.add_argument("--payload")
    browser_url.add_argument("--payload-file")

    sub.add_parser("logout", help="Remove local OAuth credentials")

    status = sub.add_parser("status", help="Show auth and registered deployments")
    status.add_argument("--spreadsheet-url", help="Check if this spreadsheet is registered")
    status.add_argument("--document-url", help="Check if this Google Doc is registered")
    status.add_argument("--presentation-url", help="Check if this Google Slides deck is registered")

    setup = sub.add_parser("setup", help="Check or install machine dependencies (agent runs this)")
    setup.add_argument("--install", action="store_true", help="Run setup.sh (pip + playwright chromium)")
    setup.add_argument("--check-only", action="store_true", help=argparse.SUPPRESS)

    parse = sub.add_parser("parse", help="Extract IDs from pasted URLs")
    parse.add_argument("--spreadsheet", help="Spreadsheet URL or id")
    parse.add_argument("--document", help="Google Doc URL or id")
    parse.add_argument("--presentation", help="Google Slides URL or id")
    parse.add_argument("--web-app", help="Web app /exec URL or deployment id")
    parse.add_argument("--script", help="Script project URL or script id")

    reg = sub.add_parser("register", help="Register or refresh a Workspace resource deployment")
    reg.add_argument("--deployment-id")
    reg.add_argument("--web-app-url")
    reg.add_argument("--spreadsheet-id")
    reg.add_argument("--spreadsheet-url")
    reg.add_argument("--document-id")
    reg.add_argument("--document-url")
    reg.add_argument("--presentation-id")
    reg.add_argument("--presentation-url")
    reg.add_argument("--script-id")
    reg.add_argument("--script-ref", help="Script project URL or script id")
    reg.add_argument("--label", default="")
    reg.add_argument("--domain", default="quintoandar.com.br")

    bootstrap = sub.add_parser(
        "bootstrap",
        help="Push Code.gs + deploy web app via Apps Script API (maintainer OAuth)",
    )
    bootstrap.add_argument("--spreadsheet-url")
    bootstrap.add_argument("--document-url")
    bootstrap.add_argument("--presentation-url")
    bootstrap.add_argument("--script-id")
    bootstrap.add_argument("--script-ref", help="Script project URL or script id")
    bootstrap.add_argument("--deployment-id", help="Existing deployment to update (with --update-only)")
    bootstrap.add_argument("--label", default="Sheets Agent")
    bootstrap.add_argument("--domain", default="quintoandar.com.br")
    bootstrap.add_argument(
        "--create-project",
        action="store_true",
        help="Create a new bound Apps Script project on the spreadsheet",
    )
    bootstrap.add_argument(
        "--update-only",
        action="store_true",
        help="Update existing deployment URL instead of creating a new web app",
    )

    call = sub.add_parser("call", help="Invoke runApi (uses latest deployment by default)")
    add_target_args(call)
    call.add_argument("--mode", choices=["oauth", "browser"], default="browser")
    call.add_argument("--action", default="read")
    call.add_argument("--range")
    call.add_argument("--value")
    call.add_argument("--sheet-name")
    call.add_argument("--payload")
    call.add_argument("--payload-file")
    call.add_argument("--no-dev-mode", action="store_true", help="OAuth mode: use published deployment instead of latest saved code")
    call.add_argument("--show-browser", action="store_true", help="Show browser window during browser mode calls")
    call.add_argument("--wait", type=int, default=2, help="Seconds to wait after navigation in browser mode")

    upload = sub.add_parser(
        "upload",
        help="Upload a local file to My Drive, share with domain, optionally append image to a Doc",
    )
    add_target_args(upload)
    upload.add_argument("--file", required=True, help="Local file path (image for --append)")
    upload.add_argument(
        "--share-domain",
        default="quintoandar.com.br",
        help="Google Workspace domain to share with (default: quintoandar.com.br)",
    )
    upload.add_argument("--share-role", default="reader", choices=["reader", "commenter", "writer"])
    upload.add_argument("--folder-id", help="Optional Drive folder id (default: My Drive root)")
    upload.add_argument(
        "--append",
        action="store_true",
        help="After upload, append image into --document-url",
    )
    upload.add_argument("--alt", help="Caption when using --append")
    upload.add_argument("--max-width", type=int, help="Max image width in points when using --append")
    upload.add_argument("--show-browser", action="store_true")

    canvas_export = sub.add_parser(
        "canvas-export",
        help="Render a JSON manifest to PNG (standalone; no Google auth required)",
    )
    canvas_export.add_argument("--manifest", required=True, help="Path to canvas manifest JSON (v1)")
    canvas_export.add_argument("--out", help="Output PNG path (default: beside manifest)")
    canvas_export.add_argument("--json", action="store_true", help="Print export metadata as JSON")

    authorize = sub.add_parser(
        "authorize",
        help="Open Apps Script editor to grant Workspace scopes (run authorizeWorkspace once)",
    )
    add_target_args(authorize)
    authorize.add_argument("--script-ref", help="Script project URL or script id")
    authorize.add_argument("--auto", action="store_true", help="Run authorizeWorkspace via Playwright (opens editor)")
    authorize.add_argument("--open-browser", action="store_true", help="Use system browser instead of Playwright profile")
    authorize.add_argument("--wait", type=int, default=8, help="Seconds to keep Playwright window open")

    return parser


def add_target_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--deployment-id", help="Specific deployment id (optional; defaults to latest)")
    parser.add_argument("--spreadsheet-id", help="Spreadsheet id (uses latest deployment)")
    parser.add_argument("--spreadsheet-url", help="Spreadsheet URL (uses latest deployment)")
    parser.add_argument("--document-id", help="Google Doc id (uses latest deployment)")
    parser.add_argument("--document-url", help="Google Doc URL (uses latest deployment)")
    parser.add_argument("--presentation-id", help="Google Slides id (uses latest deployment)")
    parser.add_argument("--presentation-url", help="Google Slides URL (uses latest deployment)")
    parser.add_argument("--web-app-url", help="Web app URL (updates latest if resource known)")


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "register":
        has_resource = (
            args.spreadsheet_id or args.spreadsheet_url or args.document_id or args.document_url
            or args.presentation_id or args.presentation_url
        )
        has_deployment = args.deployment_id or args.web_app_url
        if not has_resource:
            sys.exit("register needs --spreadsheet-url or --document-url")
        if not has_deployment:
            sys.exit("register needs --web-app-url (or --deployment-id)")

    if args.command == "bootstrap" and not args.spreadsheet_url and not args.document_url and not args.presentation_url:
        sys.exit("bootstrap needs a resource URL")

    if args.command == "upload" and not args.file:
        sys.exit("upload needs --file")

    if args.command in {"call", "browser-url", "upload"}:
        has_target = (
            getattr(args, "deployment_id", None)
            or getattr(args, "spreadsheet_id", None)
            or getattr(args, "spreadsheet_url", None)
            or getattr(args, "document_id", None)
            or getattr(args, "document_url", None)
            or getattr(args, "presentation_id", None)
            or getattr(args, "presentation_url", None)
            or getattr(args, "web_app_url", None)
        )
        if args.command == "call" and not has_target:
            registry = load_registry()
            total = (
                len(registry.get("spreadsheets", {}))
                + len(registry.get("documents", {}))
                + len(registry.get("presentations", {}))
            )
            if total != 1:
                sys.exit("call needs a resource URL or a single registered resource")

    commands = {
        "signin": cmd_signin,
        "browser-auth": cmd_browser_auth,
        "browser-url": cmd_browser_url,
        "logout": cmd_logout,
        "status": cmd_status,
        "setup": cmd_setup,
        "parse": cmd_parse,
        "register": cmd_register,
        "bootstrap": cmd_bootstrap,
        "call": cmd_call,
        "upload": cmd_upload,
        "canvas-export": cmd_canvas_export,
        "authorize": cmd_authorize,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
