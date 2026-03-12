---
name: stratum:discuss-phase
description: Create canonical CONTEXT.md for a roadmap phase before planning
argument-hint: "<phase-ref|--next>"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Resolve a roadmap feature and create or refresh `CONTEXT.md` with locked decisions, assumptions, deferred ideas, and option traceability.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs discuss-phase $ARGUMENTS
```

Then inspect the generated context file and continue to `/stratum:plan-phase`.
</process>
