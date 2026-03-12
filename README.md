# Stratum

Stratum is a planning and orchestration layer for agentic software development.

It is designed to be complementary to execution systems such as get-shit-done rather than replacing them. Stratum keeps canonical planning artifacts in `.planning/`, then exports adapter views for downstream workflows.

Current adapter support:

- get-shit-done

Intended compatibility:

- Claude Code workflows
- Codex workflows
- ECC-style workflows
- custom agentic development stacks

## Positioning

Stratum owns planning, orchestration, and canonical artifact structure.

Execution systems can stay focused on:

- implementation
- verification
- delivery
- runtime-specific workflows

That split lets you install Stratum alone, or install Stratum together with get-shit-done and use both in the same repository.

## Install

```bash
npx @jpabbuehl/stratum@latest --claude --global
```

Other supported targets:

```bash
npx @jpabbuehl/stratum@latest --codex --global
npx @jpabbuehl/stratum@latest --gemini --global
npx @jpabbuehl/stratum@latest --opencode --global
npx @jpabbuehl/stratum@latest --all --global
```

Project-local install:

```bash
npx @jpabbuehl/stratum@latest --claude --local
```

## What It Installs

For supported runtimes, Stratum installs:

- `commands/stratum/*` or the runtime-specific equivalent
- `stratum/bin/stratum-tools.cjs`
- `stratum/workflows/overview.md`
- `stratum/adapters/gsd/README.md`

## Initial Commands

- `/stratum:help`
- `/stratum:init-solution`
- `/stratum:plan-phase <phase-ref|--next>`
- `/stratum:export-gsd <phase-ref|--next>`

## Canonical Model

Stratum treats `.planning/` as the source of truth.

Canonical artifacts:

- `.planning/BLUEPRINT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `.planning/backlog/`
- `.planning/phases/<nn>-<slug>/`

Adapter outputs are generated under:

- `.planning/adapters/gsd/`

## Example

Initialize planning:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs init-solution
```

Plan a feature:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs plan-phase --next
```

Export for get-shit-done:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs export-gsd --next
```

## Publish

Package name:

- `@jpabbuehl/stratum`

CLI/bin name:

- `stratum`

Before publishing:

```bash
npm login
npm test
npm pack --dry-run
npm publish --access public
```

## Development

```bash
npm test
```
