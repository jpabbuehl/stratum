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

Topology presets:

- `dual-argumentation`
- `council`
- `round-robin`
- `critique`

Dual mode keeps Claude as canonical writer and uses wrapper-driven delegates (`claude`, `codex`, optional `gemini`) through a local shell-script delegation path rather than Owlex MCP.

Current adapter support:

- get-shit-done
- beads

Planned compatibility targets:

- ECC
- custom Claude Code workflows
- custom Codex workflows
