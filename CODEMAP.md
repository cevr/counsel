# Counsel Codemap

## Overview

Single-command Bun CLI. Detect current agent, flip to the opposite one, print a structured stdout payload, write temp artifacts under `/tmp/counsel`.

## Key Files

| File                                | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `src/main.ts`                       | Bun entrypoint and live layer assembly                    |
| `src/program.ts`                    | Testable CLI runner for explicit argv input               |
| `src/commands/index.ts`             | Public `counsel [prompt]` surface and stdout payloads     |
| `src/services/Host.ts`              | Encapsulates env, cwd, stdin, and exit-code writes        |
| `src/services/AgentPlatform.ts`     | Source detection and provider-specific argv construction  |
| `src/services/InvocationRunner.ts`  | Live child-process execution boundary                     |
| `src/services/Run.ts`               | Prompt resolution and temp artifact writing around runner |
| `skills/counsel/SKILL.md`           | Repo-shipped skill for host-agent usage                   |
| `skills/counsel/agents/openai.yaml` | Skill UI metadata for Codex surfaces                      |

## Patterns

- Keep public surface at one root command. No subcommands.
- `HostService` and `InvocationRunnerService` are the swap points for tests.
- `AgentPlatformService` decides provider and argv. `RunService` handles file and artifact work around the runner.
- `RunService` returns manifest/preview data, but does not persist a `run.json` file.
- If CLI contract changes, update `README.md` and `skills/counsel/SKILL.md` in the same patch.
