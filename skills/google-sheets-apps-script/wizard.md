# Onboarding wizard — non-technical users

Agent reads this during setup. **One user-facing message per turn.** User never runs terminal.

Language: match user (default PT-BR). No jargon: say **link da planilha**, **aba**, **Extensões → Apps Script**.

---

## Before anything (agent only — silent)

```bash
bash "$SKILL_ROOT/scripts/setup.sh"
python3 "$SKILL_ROOT/scripts/sheets_agent.py" status
```

If skill folder missing → reinstall tapioca plugin or install from [gist](https://gist.github.com/gabriel-dantas98/6ad86b6bfab840703ec214f228c3004b) (`install.sh`) first. `SKILL_ROOT` = directory containing `SKILL.md` (see main skill).

---

## Detect state

| Check | How | Meaning |
|-------|-----|---------|
| Machine ready | `setup --check-only` | playwright + python ok |
| Browser session | `status` → `browser_ready` | Google login for calls |
| Planilha integrada | `status --spreadsheet-url URL` → `registered` | Can edit without wizard |
| clasp disponível | `status` → `clasp_logged_in` | Agent can deploy script automatically |

**Any edit request on unregistered sheet → start wizard at step matching state.**

---

## Step 0 — Welcome (unregistered / first time)

> Oi! Vou conectar sua planilha Google para editar por aqui — você só clica e cola links, sem terminal.
>
> **Você já tem uma planilha ou quer criar uma nova?**
> - Nova → abre [sheets.new](https://sheets.new) e me avisa quando estiver pronta
> - Já tenho → cola o **link da planilha** (barra de endereço do Google Sheets)

Wait for answer. One question only.

---

## Step 1 — Spreadsheet URL

User pastes URL. Agent runs:

```bash
python3 .../sheets_agent.py status --spreadsheet-url "URL"
python3 .../sheets_agent.py parse --spreadsheet "URL"
```

If `registered: true` → skip to Step 4 (browser-auth) or Step 6 (daily use) if browser ready.

If `registered: false` → continue Step 2.

---

## Step 2 — Connect script (pick path)

### Path A — clasp (agent automates, preferred)

When `clasp_logged_in: true` **and** user pasted script URL before OR agent asks once:

> Preciso vincular o script na planilha. Você já abriu **Extensões → Apps Script** nessa planilha alguma vez?
> Se sim, cola o **link do projeto** (script.google.com/.../projects/.../edit).
> Se não, abre a planilha → **Extensões → Apps Script** (só abrir já cria o projeto) → cola o link da barra de endereço.

Agent runs (user does nothing):

```bash
bash .../scripts/clasp_bootstrap.sh \
  --spreadsheet-url "..." \
  --script-id "..." \
  [--update-only]   # if redeploy
```

Say: **Script instalado ✓**

### Path B — Manual (no clasp)

One sub-step per message. Offer to show Code.gs in chat if user can't find file.

**2b.1**
> Abre sua planilha → menu **Extensões** → **Apps Script**.

**2b.2**
> Apaga o conteúdo do arquivo `Code.gs` (se existir). Vou te mandar o código — copia tudo e cola lá → **Salvar** (ícone disquete).

Agent pastes full content from [templates/Code.gs](../templates/Code.gs) or says "ready to paste on request".

**2b.3**
> Agora **Implantar** → **Nova implantação** → ícone engrenagem → tipo **App da Web**.
> - Executar como: **Eu**
> - Quem pode acessar: **Somente eu**
> → **Implantar** → autoriza se pedir → copia o **link do app da Web** (termina em `/exec`) e cola aqui.

Agent runs:

```bash
python3 .../sheets_agent.py register \
  --spreadsheet-url "..." \
  --web-app-url "..." \
  --script-ref "..."   # if user also pasted script URL
```

Say: **Deploy registrado ✓**

---

## Step 3 — Google login (browser)

Only if `browser_ready: false`.

> Quase lá! Vou abrir uma janela do Google — **faça login com a mesma conta** da planilha e do Apps Script. Quando aparecer sua conta, volte aqui.

Agent runs:

```bash
python3 .../sheets_agent.py browser-auth
```

Say: **Login ok ✓**

---

## Step 4 — Test

Agent runs silently:

```bash
python3 .../sheets_agent.py call \
  --spreadsheet-url "..." \
  --payload '{"action":"update","range":"A1","value":"Conectado com sucesso"}'
```

> Pronto! Escrevi **"Conectado com sucesso"** na célula A1. Confere na planilha?
>
> O que você quer montar agora — dashboard, kanban, lista, outra coisa?

---

## Unregistered sheet mid-conversation

User: "Atualiza minha planilha X" (URL or name, not integrated).

> Essa planilha ainda não está conectada. Cola o **link completo** dela que eu configuro — leva uns minutos na primeira vez.

Then wizard from Step 1. Do not attempt `call` until registered + browser ready.

---

## Existing sheet with data

Before first write on integrated sheet:

```bash
python3 .../sheets_agent.py call --spreadsheet-url "..." --payload '{"action":"listSheets"}'
python3 .../sheets_agent.py call ... --payload '{"action":"read","sheetName":"...","range":"A1:G30"}'
```

Tell user what you found in plain language. Ask before overwriting.

---

## Google Docs onboarding

Same flow as Sheets, but user pastes **link do Google Docs** (`/document/d/...`).

```bash
python3 .../sheets_agent.py status --document-url "URL"
python3 .../sheets_agent.py register --document-url "URL" --web-app-url "..." --script-id "..."
```

**Existing doc + shared deploy (recommended):** one Apps Script on the spreadsheet can edit any doc the user has access to — register the doc URL pointing at the same `/exec` as the sheet.

**Doc-bound script:** user opens **Extensões → Apps Script** on the doc once, then agent runs `clasp_bootstrap.sh --document-url "..." --script-id "..."`.

### Docs scope (one-time after v2 upgrade)

If Docs calls fail with `permission to call DocumentApp`:

```bash
python3 .../sheets_agent.py authorize --spreadsheet-url "SHEET_URL" --auto
```

Agent opens Apps Script, runs `authorizeWorkspace`, accepts OAuth. User does nothing if browser profile is already logged in.

---

## Error → user message

| Error | Tell user |
|-------|-----------|
| Google login required | "Sessão expirou — vou abrir o Google de novo." → `browser-auth` |
| DocumentApp permission | "Preciso autorizar Google Docs no script." → `authorize --auto` then retry |
| respond_ / Unknown action | "Preciso atualizar o script na planilha." → clasp_bootstrap or manual 2b |
| Web app not found | "Link do deploy inválido — cola o `/exec` de novo ou eu redeployo." |
| Sheet already exists | "Já existe uma aba com esse nome — uso ela ou crio outro nome?" |

---

## Maintainer shortcuts (agent only, never show to end user)

```bash
# OAuth API deploy
python3 .../sheets_agent.py bootstrap --spreadsheet-url "..." --script-ref "..."

# clasp
bash .../scripts/clasp_bootstrap.sh --spreadsheet-url "..." --script-id "..." --update-only
```
