# AGENTS.md

## Project

- Single-command CLI. Keep the public surface at `counsel [prompt]` plus flags.
- No persisted config. No subcommands. No adapter/plugin system.
- Print the preview/result payload to stdout. Do not reintroduce `--json` or persisted `run.json`.
- Repo skill lives at `skills/counsel/`. If CLI behavior changes, update `README.md`, `skills/counsel/SKILL.md`, and `skills/counsel/agents/openai.yaml` in the same patch.

## Stack

- Bun runtime and package manager.
- Effect v4 with `ServiceMap.Service`.
- `HostService` owns `cwd`, env, stdin, and exit-code side effects.
- `AgentPlatformService` owns provider detection and argv building.
- `InvocationRunnerService` owns child-process execution.
- `RunService` owns prompt resolution and artifact writing around the runner.

## Verify

- Run `bun run gate` before handoff.
- Prefer test layers over `Bun.spawn` in CLI tests.
- Keep one layer of service integration where it pays off; stub child execution beneath that.

## Docs

- Architecture map: `CODEMAP.md`
