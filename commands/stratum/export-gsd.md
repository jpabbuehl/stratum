---
name: stratum:export-gsd
description: Export a get-shit-done adapter view without changing source-of-truth ownership
argument-hint: "<phase-ref|--next>"
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
Generate an adapter export for get-shit-done from Stratum's canonical phase artifacts.
</objective>

<process>
Run:

```bash
node ~/.claude/stratum/bin/stratum-tools.cjs export-gsd $ARGUMENTS
```

Then report the generated export directory under `.planning/adapters/gsd/`.
</process>
