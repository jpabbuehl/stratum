---
name: stratum:plan-phase
description: Create canonical planning artifacts for a roadmap phase
argument-hint: "<phase-ref|--next>"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Create canonical phase artifacts inside `.planning/phases/<nn>-<slug>/`.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs plan-phase $ARGUMENTS
```

Then report the resolved phase directory and the generated files.
</process>
