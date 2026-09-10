# Basecamp coworker for Hermes

## Goal

Add a self-contained `tapioca` filling that lets a Hermes Agent act as an interactive coworker inside Basecamp Campfire. The desired onboarding is intentionally tiny: give Hermes the GitHub URL for the filling, let it inspect the skill, install prerequisites, guide unavoidable authentication, configure the Basecamp integration, expose the inbound endpoint, verify the setup, and report that it is ready.

The user should not need to manually edit YAML, discover project/chat IDs, assemble curl requests, or understand the Basecamp API.

## Desired UX

```text
User -> Hermes:
Install and configure this:
https://github.com/gabriel-dantas98/tapioca/tree/main/skills/basecamp-coworker

Hermes:
- installs/validates the filling
- installs/validates the official Basecamp CLI
- performs Basecamp authentication when required
- creates/configures the Basecamp chatbot
- exposes an HTTPS callback endpoint
- starts the local bridge as a service
- runs health checks
- tells the user how to invoke it in Basecamp

Basecamp Campfire:
!hermes investigate this TODO

Hermes:
<response in the same Campfire>
```

## Scope

The first version supports one Hermes runtime and one or more Basecamp Campfires reachable through the authenticated Basecamp account.

It should provide:

- interactive invocation from Basecamp Campfire using the Basecamp chatbot mechanism
- inbound Basecamp message -> Hermes prompt routing
- outbound Hermes response -> Basecamp Campfire
- Basecamp data/tool access through the official Basecamp CLI rather than a custom API wrapper
- automatic dependency checks and setup
- HTTPS exposure suitable for a local or homelab Hermes installation
- a `doctor` command that verifies the full chain

## Non-goals

The first version will not become a general messaging gateway, MCP server, workflow engine, queueing platform, or multi-tenant SaaS.

It will not require Redis, Postgres, Kubernetes, or a custom Basecamp SDK.

Slack, Discord, and other messaging adapters may be possible later, but the initial implementation stays Basecamp-specific.

## Architecture

```text
Basecamp Campfire
        |
        | interactive chatbot request
        v
public HTTPS endpoint
        |
        v
basecamp-coworker bridge
        |
        | normalized prompt + Basecamp context
        v
Hermes Agent
        |
        +--> Basecamp CLI
        +--> other Hermes skills/tools
        |
        v
bridge
        |
        v
Basecamp chatbot response
```

The bridge is deliberately thin. Basecamp owns chat delivery and Basecamp authentication. Hermes owns reasoning and tool use. Tapioca owns installation, glue, lifecycle, and validation.

## Proposed repository layout

```text
skills/
  basecamp-coworker/
    SKILL.md
    DESIGN.md
    scripts/
      setup.py
      bridge.py
      doctor.py
      install-service.sh
    references/
      basecamp-chatbot.md
      hermes-runtime.md
```

The filling must remain installable as an ordinary skill directory so Hermes can consume it from a GitHub URL/tap without requiring a Tapioca-specific installer.

## Components

### `SKILL.md`

The agent-facing contract and bootstrap instructions. It should tell Hermes how to:

1. detect the host OS/runtime
2. verify that Hermes itself is running in a suitable mode
3. install or locate the official Basecamp CLI
4. authenticate Basecamp if required
5. run `setup.py`
6. perform any unavoidable human confirmation
7. install/start the bridge service
8. run `doctor.py`
9. explain the resulting Basecamp invocation to the user

The skill should prefer executing the provided scripts over recreating setup logic itself.

### `setup.py`

Idempotent setup orchestrator.

Responsibilities:

- dependency detection
- Basecamp CLI detection/install guidance
- Basecamp auth-state verification
- discovery of the relevant Basecamp account/project/chat resources when possible
- creation/configuration of the Basecamp interactive chatbot
- creation of local configuration with restrictive file permissions
- HTTPS exposure configuration
- service installation/start

Repeated execution must converge rather than duplicate chatbots or services.

### `bridge.py`

Small long-running HTTP service.

Responsibilities:

- expose health/readiness endpoints
- receive the Basecamp chatbot callback
- validate the inbound request using the strongest mechanism supported by Basecamp
- normalize user text and Basecamp context
- invoke Hermes through the most stable supported local interface
- apply timeout/error handling
- return/post the Hermes response in Basecamp-compatible form
- avoid processing its own responses recursively

The bridge must not contain Basecamp domain logic already available through the official CLI.

### `doctor.py`

Read-only diagnostic tool that checks:

- Hermes availability
- Basecamp CLI availability and auth state
- local config
- chatbot configuration
- public endpoint reachability
- bridge process/service health
- Basecamp callback path configuration

It should produce both human-readable output and a structured non-zero exit code on failure so an agent can repair the setup.

## Basecamp tool surface

Hermes should use the official Basecamp CLI for Basecamp operations whenever practical. The CLI remains the authoritative tool surface for project data, todos, messages, comments, cards, and related operations.

The bridge only handles transport between Campfire and Hermes.

This separation keeps the integration maintainable and avoids duplicating Basecamp API behavior inside Tapioca.

## Invocation model

The initial Basecamp-native invocation should use the interactive chatbot command mechanism, for example:

```text
!hermes summarize the blockers in this project
```

If Basecamp later exposes a reliable native `@mention` mechanism for chatbots, support can be added without changing the bridge/Hermes boundary.

## Conversation context

V1 should be stateless by default beyond the context provided by Basecamp and Hermes itself.

A small bounded recent-message window may be included when required for coherent follow-up responses, but persistent conversation storage is explicitly deferred unless Hermes already provides a stable session primitive that can be keyed by Basecamp chat/conversation identifiers.

## HTTPS exposure

The bridge needs a publicly reachable HTTPS callback URL.

The preferred V1 strategy is an adapter with the simplest supported tunnel option, initially Cloudflare Tunnel if available. Tunnel implementation should be isolated so it can later be replaced by a user-provided public URL, reverse proxy, or another tunnel provider.

Setup should never silently expose unrelated local services.

## Configuration and secrets

Local runtime configuration should live outside the repository, for example under:

```text
~/.config/tapioca/basecamp-coworker/
```

Secrets must never be committed to Git.

Files containing credentials or chatbot keys should be created with restrictive permissions where the platform supports it.

The public Tapioca repository contains only templates/instructions.

## Safety and permissions

The bootstrap may automate installation and configuration, but authentication and any action that grants meaningful third-party access should remain visible to the user.

The setup flow should clearly distinguish:

- dependency installation
- Basecamp authentication
- creation of a chatbot/integration
- creation of a public HTTPS endpoint
- persistence as a background service

The agent should ask only for confirmations that are genuinely unavoidable or security-sensitive.

## Error handling

The system should fail with actionable diagnostics instead of partial silent setup.

Examples:

- Basecamp CLI missing -> install or explain exact unsupported platform condition
- Basecamp auth missing -> initiate/document auth and resume setup
- public endpoint unavailable -> preserve local setup and report the failed layer
- Hermes invocation failure -> return a short user-facing Campfire error and log local diagnostics
- duplicate chatbot -> detect/reuse rather than create another

## Testing strategy

### Static/unit tests

- inbound payload normalization
- command parsing
- loop/self-response prevention
- config loading and permission handling
- timeout/error mapping
- idempotent setup decisions with mocked subprocess/API boundaries

### Smoke tests

A local smoke harness should be able to run without a live Basecamp account by substituting fixture payloads and a fake Hermes command/runtime.

### Manual integration test

The acceptance test for a real environment is:

1. fresh Hermes installation or clean environment
2. user gives Hermes only the GitHub URL and asks it to configure the filling
3. setup completes with only unavoidable auth/permission interactions
4. user types `!hermes hello` in a configured Basecamp Campfire
5. Hermes replies in that Campfire
6. Hermes can answer a question requiring the official Basecamp CLI
7. `doctor.py` reports healthy

## Acceptance criteria

The feature is successful when a technically competent user does not need to understand the implementation to install it.

Specifically, after giving Hermes the skill URL, the user must not need to:

- manually edit Tapioca/Hermes config files
- manually copy Basecamp project/chat IDs
- hand-write API requests
- manually wire the callback URL
- manually launch the bridge on every reboot after opting into service installation

The user may still need to complete Basecamp login/authorization and approve public endpoint/service creation where required.

## Deferred decisions

These should be resolved during implementation only if the APIs/runtime require them:

- exact stable Hermes programmatic invocation interface
- exact Basecamp request verification mechanism
- exact Cloudflare Tunnel command/service lifecycle per OS
- whether Basecamp chatbot creation can be fully automated by the official CLI or requires a small direct API call during setup

These are implementation details behind the boundaries defined above and should not expand V1 scope.
