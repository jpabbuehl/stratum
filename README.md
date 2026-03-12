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

Choose the target runtime layout explicitly:

- `--claude` installs Stratum in the layout Claude Code expects
- `--codex` installs Stratum in the layout Codex expects

These flags matter because Claude Code and Codex do not load commands from the same directories or in the same format.

Recommended Claude Code install:

```bash
npx @jpabbuehl/stratum@latest --claude --global
```

Codex install:

```bash
npx @jpabbuehl/stratum@latest --codex --global
```

Install for both supported runtimes on the same machine:

```bash
npx @jpabbuehl/stratum@latest --all --global
```

Project-local install for the current repo only:

```bash
npx @jpabbuehl/stratum@latest --claude --local
```

### Why `--claude` or `--codex`?

The installer needs to know which runtime layout to write:

- Claude Code layout:
  - `~/.claude/commands/stratum/`
  - `~/.claude/stratum/`
- Codex layout:
  - `~/.codex/skills/stratum-*`
  - `~/.codex/stratum/`

Stratum is the same product in both cases, but the installed file structure is different.

### Why `--global` or `--local`?

These flags control installation scope:

- `--global`
  - installs into your user-level runtime config directory
  - use this when you want Stratum available in all projects on that machine
- `--local`
  - installs into the current repository only
  - use this when you want to validate or isolate Stratum in a single project

Examples:

- `--claude --global` installs into `~/.claude/...`
- `--claude --local` installs into `./.claude/...`
- `--codex --global` installs into `~/.codex/...`
- `--codex --local` installs into `./.codex/...`

## What It Installs

For supported runtimes, Stratum installs:

- runtime-specific command assets for the selected target layout
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
