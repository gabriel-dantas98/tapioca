# tapioca rebrand — design spec

**Date:** 2026-07-16  
**Status:** approved  
**Scope:** communication + visual identity (dual surface)

## Problem

The plugin already ships mixed capabilities (editorial PT-BR, UX audit, multi-engine image gen, Google Workspace). The brand still sells "sabores brasileiros / skills PT-BR", which under-sells the product and over-anchors on language.

## Decision

**Dual surface pivot** (not hard rename):

- Public thesis: tapioca = base; skills = fillings.
- EN primary, PT secondary for plugin surface.
- Skill/agent slugs keep `-br` where they already exist (no breaking rename).
- PT-BR remains a *domain* of some fillings, not the brand.

## Taglines

| Lang | Line |
|------|------|
| EN | We bring the base. You pick the filling. |
| PT | A nossa base, o seu recheio. |

## Copy rules

- README: EN hero (name + EN tagline + body). Short PT block near top (PT tagline + 2–3 lines).
- `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`: EN `description`; drop `brasil` / `portugues` / `pt-br` as brand keywords (keep capability keywords).
- Marketplace manifests: EN descriptions aligned with plugin.json.
- `AGENTS.md`: update thesis + conventions to base/filling; plugin surface EN; match user language in skill sessions. Skill internals may stay PT-BR for domain-specific fillings.

## Visual

**Hero image:** food photo of three folded tapiocas with different fillings (user-provided). Literal metaphor for base + fillings; warm wooden board, natural light.

- Asset: `assets/banner.jpg` (~1024×640 JPEG, optimized).
- Wordmark is typographic in README; banner carries the metaphor without overlaid text.

*(Earlier concept A — soft clay mass — was explored and replaced by this photo per product owner preference.)*

## Out of scope

- Renaming skills/agents (`humanizer-br`, `usabilidade-br`, …).
- Translating skill bodies / wizard copy to EN.
- Full marketing site / favicon set (can follow later).

## Success criteria

- Marketplace/plugin descriptions no longer lead with "sabores brasileiros" or "skills PT-BR" as the product definition.
- README opens in EN with approved taglines; PT remains reachable.
- Banner matches concept A (volumetric soft mass + embedded fillings).
- Slugs unchanged; existing `/tapioca:*-br` invocations still work.
