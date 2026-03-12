---
name: stratum:phase-status
description: Report artifact completeness, unresolved items, QA state, and export readiness
argument-hint: "<phase-ref|--next>"
allowed-tools:
  - Read
  - Bash
---
<objective>
Inspect the canonical phase directory and summarize completeness and readiness.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs phase-status $ARGUMENTS
```

Then present artifact coverage, unresolved items, QA state, and export readiness.
</process>
