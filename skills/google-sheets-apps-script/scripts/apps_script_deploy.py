"""Apps Script API helpers for automated Code.gs push + web app deploy."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_API = "https://script.googleapis.com/v1/projects"
SKILL_DIR = Path(__file__).resolve().parents[1]
CODE_GS = SKILL_DIR / "templates" / "Code.gs"
MANIFEST = SKILL_DIR / "templates" / "appsscript.json"

DEPLOY_SCOPES = (
    "https://www.googleapis.com/auth/script.projects",
    "https://www.googleapis.com/auth/script.deployments",
)


def api_request(access_token: str, method: str, url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode()
        raise SystemExit(f"Apps Script API {method} {url} failed ({err.code}):\n{detail}") from err


def load_project_files() -> list[dict]:
    templates = SKILL_DIR / "templates"
    return [
        {"name": "Code", "type": "SERVER_JS", "source": (templates / "Code.gs").read_text(encoding="utf-8")},
        {"name": "Docs", "type": "SERVER_JS", "source": (templates / "Docs.gs").read_text(encoding="utf-8")},
        {"name": "MarkdownDoc", "type": "SERVER_JS", "source": (templates / "MarkdownDoc.gs").read_text(encoding="utf-8")},
        {"name": "CommentsDoc", "type": "SERVER_JS", "source": (templates / "CommentsDoc.gs").read_text(encoding="utf-8")},
        {"name": "appsscript", "type": "JSON", "source": MANIFEST.read_text(encoding="utf-8")},
    ]


def create_bound_project(access_token: str, *, parent_id: str, title: str) -> dict:
    return api_request(
        access_token,
        "POST",
        SCRIPT_API,
        {"title": title, "parentId": parent_id},
    )


def push_project_content(access_token: str, script_id: str) -> dict:
    return api_request(
        access_token,
        "PUT",
        f"{SCRIPT_API}/{script_id}/content",
        {"files": load_project_files()},
    )


def create_version(access_token: str, script_id: str, description: str) -> dict:
    return api_request(
        access_token,
        "POST",
        f"{SCRIPT_API}/{script_id}/versions",
        {"description": description},
    )


def create_webapp_deployment(access_token: str, script_id: str, version_number: int, description: str) -> dict:
    return api_request(
        access_token,
        "POST",
        f"{SCRIPT_API}/{script_id}/deployments",
        {"versionNumber": version_number, "description": description},
    )


def update_webapp_deployment(
    access_token: str,
    script_id: str,
    deployment_id: str,
    version_number: int,
    description: str,
) -> dict:
    return api_request(
        access_token,
        "PUT",
        f"{SCRIPT_API}/{script_id}/deployments/{deployment_id}",
        {
            "deploymentConfig": {
                "scriptId": script_id,
                "versionNumber": version_number,
                "description": description,
            }
        },
    )


def extract_webapp_url(deployment: dict) -> str:
    for entry in deployment.get("entryPoints", []):
        web_app = entry.get("webApp") or {}
        url = web_app.get("url")
        if url:
            return url
    deployment_id = deployment.get("deploymentId", "")
    if deployment_id:
        return f"https://script.google.com/macros/s/{deployment_id}/exec"
    raise SystemExit(f"No web app URL in deployment response:\n{json.dumps(deployment, indent=2)}")


def bootstrap_script(
    access_token: str,
    *,
    parent_id: str,
    script_id: str | None,
    label: str,
    deployment_id: str | None,
    create_project: bool,
) -> dict:
    if create_project or not script_id:
        project = create_bound_project(access_token, parent_id=parent_id, title=label or "Workspace Agent")
        script_id = project["scriptId"]

    push_project_content(access_token, script_id)
    version = create_version(access_token, script_id, description=f"{label} — sheets-agent bootstrap")
    version_number = int(version["versionNumber"])

    if deployment_id:
        deployment = update_webapp_deployment(
            access_token,
            script_id,
            deployment_id,
            version_number,
            description=f"{label} — web app update",
        )
    else:
        deployment = create_webapp_deployment(
            access_token,
            script_id,
            version_number,
            description=f"{label} — web app",
        )

    web_app_url = extract_webapp_url(deployment)
    return {
        "scriptId": script_id,
        "deploymentId": deployment.get("deploymentId", deployment_id),
        "webAppUrl": web_app_url,
        "versionNumber": version_number,
    }
