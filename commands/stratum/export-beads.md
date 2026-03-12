---
name: stratum:export-beads
description: Export beads tracker artifacts from canonical TASK-GRAPH.json
argument-hint: "<phase-ref|--next>"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Create a beads adapter view from the canonical task graph without changing ownership of the source artifacts.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs export-beads $ARGUMENTS
```

Then report the generated export directory under `.planning/adapters/beads/`.
</process>
