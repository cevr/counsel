# Counsel Codemap

## Overview

Single-command Bun CLI. Detect current agent, flip to the opposite one, write run artifacts.

## Key Files

| File                                | Purpose                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| `src/main.ts`                       | CLI entrypoint, JSON usage guard, known-error exit mapping |
| `src/commands/index.ts`             | Public `counsel [prompt]` surface and output formatting    |
| `src/services/AgentPlatform.ts`     | Source detection and provider-specific argv construction   |
| `src/services/Run.ts`               | Prompt resolution, artifact directories, child execution   |
| `skills/counsel/SKILL.md`           | Repo-shipped skill for host-agent usage                    |
| `skills/counsel/agents/openai.yaml` | Skill UI metadata for Codex surfaces                       |

## Patterns

- Keep public surface at one root command. No subcommands.
- `AgentPlatformService` decides provider and argv. `RunService` handles file and process work.
- If CLI contract changes, update `README.md` and `skills/counsel/SKILL.md` in the same patch.
