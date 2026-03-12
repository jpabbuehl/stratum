# Stratum Overview

Stratum is a planning and orchestration layer.

It keeps canonical planning artifacts under `.planning/`, treats exports as adapters, and stays compatible with adjacent execution systems instead of replacing them.

Default orchestration mode:

- `deep + dual`

Mode matrix:

- `quick + single`
- `quick + dual`
- `deep + single`
- `deep + dual`

Dual mode keeps Claude as canonical writer and uses Codex as a secondary planner or critic through a local wrapper-based delegation path.

Current adapter support:

- get-shit-done
- beads

Planned compatibility targets:

- ECC
- custom Claude Code workflows
- custom Codex workflows
