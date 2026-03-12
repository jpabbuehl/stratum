---
name: stratum:plan-phase
description: Create canonical planning artifacts for a roadmap phase after wrapper-driven deliberation
argument-hint: "<phase-ref|--next> [--single|--dual] [--quick|--deep] [--topology <preset>] [--vendors claude,codex,gemini]"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Create canonical phase artifacts inside `.planning/phases/<nn>-<slug>/`, including persisted multi-round deliberation state. Default mode is `--deep --dual`.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs plan-phase $ARGUMENTS
```

Then report:
- the resolved phase directory
- the orchestration mode and topology
- the selected vendors
- generated canonical artifacts
- generated round artifacts under `DELIBERATION/`
- whether vendor delegates were available
</process>
