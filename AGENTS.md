# AGENTS.md

## Project

- Single-command CLI. Keep the public surface at `counsel [prompt]` plus flags.
- No persisted config. No subcommands. No adapter/plugin system.
- Repo skill lives at `skills/counsel/`. If CLI behavior changes, update `README.md`, `skills/counsel/SKILL.md`, and `skills/counsel/agents/openai.yaml` in the same patch.

## Stack

- Bun runtime and package manager.
- Effect v4 with `ServiceMap.Service`.
- `AgentPlatformService` owns provider detection and argv building.
- `RunService` owns prompt resolution, execution, and artifact writing.

## Verify

- Run `bun run gate` before handoff.
- Prefer tests around routing, prompt resolution, and file artifacts over shallow snapshots.

## Docs

- Architecture map: `CODEMAP.md`
