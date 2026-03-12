# Stratum

Stratum is a planning and orchestration layer for agentic software development.

It is designed to be complementary to execution systems such as get-shit-done rather than replacing them. Stratum keeps canonical planning artifacts in `.planning/`, then exports adapter views for downstream workflows.

The default planning posture is:

- `--deep --dual`
- Claude as canonical writer
- wrapper-driven delegates for `claude` and `codex`
- persisted deliberation state under `DELIBERATION/`

Current adapter support:

- get-shit-done
- beads

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
- `/stratum:discuss-phase <phase-ref|--next>`
- `/stratum:plan-phase <phase-ref|--next> [--topology <preset>] [--vendors claude,codex,gemini]`
- `/stratum:challenge-plan <phase-ref|--path <plan-path>> [--topology <preset>] [--vendors claude,codex,gemini]`
- `/stratum:phase-status <phase-ref|--next>`
- `/stratum:export-gsd <phase-ref|--next>`
- `/stratum:export-beads <phase-ref|--next>`
- `/stratum:doctor`

## Planning Modes

Stratum supports the mode matrix from the original dual-planning design:

- `--quick --single`
  - one planner pass
  - light validation
- `--quick --dual`
  - wrapper-driven dual consultation
  - light merge path
- `--deep --single`
  - one planner with stronger QA
- `--deep --dual`
  - default
  - independent multi-vendor rounds before synthesis
  - challenge/defense oriented deliberation
  - persisted synthesis buckets

Topology presets:

- `dual-argumentation`
- `council`
- `round-robin`
- `critique`

The backend stores deliberation artifacts in:

- `.planning/phases/<nn>-<slug>/DELIBERATION/packet.json`
- `.planning/phases/<nn>-<slug>/DELIBERATION/topology.json`
- `.planning/phases/<nn>-<slug>/DELIBERATION/round-1/*.md`
- `.planning/phases/<nn>-<slug>/DELIBERATION/round-2/*.md`
- `.planning/phases/<nn>-<slug>/DELIBERATION/synthesis.json`
- `.planning/phases/<nn>-<slug>/DELIBERATION/sessions.json`

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
- `.planning/adapters/beads/`

## Example

Initialize planning:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs init-solution --deep --dual
```

Discuss a phase before planning:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs discuss-phase --next
```

Plan a feature:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs plan-phase --next --deep --dual
```

Run a three-vendor council:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs plan-phase --next --deep --dual --topology council --vendors claude,codex,gemini
```

Run a serial round-robin:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs plan-phase --next --deep --dual --topology round-robin --vendors claude,codex,gemini
```

Challenge an existing plan:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs challenge-plan --next --deep --dual
```

Check phase readiness:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs phase-status --next
```

Export for get-shit-done:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs export-gsd --next
```

Export for beads:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs export-beads --next
```

Doctor the local setup:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs doctor
```

## Dual Planning Notes

Stratum deliberately does not depend on Owlex MCP.

It does reuse the useful parts of the original design:

- topology-driven planning modes
- wrapper-driven delegation to external vendor CLIs
- persisted deliberation artifacts
- independent first-pass responses
- critique/revision rounds before synthesis
- synthesis buckets such as agreed, dismissed, and unresolved
- adapter-first exports that do not take ownership away from canonical `.planning/` artifacts

The package includes local wrappers at:

- `stratum/wrappers/claude-wrapper.sh`
- `stratum/wrappers/codex-wrapper.sh`
- `stratum/wrappers/gemini-wrapper.sh`

Those wrappers are used by the deterministic backend when vendor delegation is enabled.

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
