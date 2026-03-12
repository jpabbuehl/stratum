---
name: stratum:plan-phase
description: Create canonical planning artifacts for a roadmap phase
argument-hint: "<phase-ref|--next> [--single|--dual] [--quick|--deep]"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Create canonical phase artifacts inside `.planning/phases/<nn>-<slug>/`, including persisted deliberation state. Default mode is `--deep --dual`.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs plan-phase $ARGUMENTS
```

Then report:
- the resolved phase directory
- the orchestration mode and topology
- generated canonical artifacts
- generated deliberation artifacts
- whether the secondary planner was available
</process>
