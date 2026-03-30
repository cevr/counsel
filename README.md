# counsel

One command. Opposite agent only.

If you are in Claude, `counsel` routes to Codex. If you are in Codex, it routes to Claude.

## Install

```bash
bun install
bun run build
bin/counsel --help
```

For local PATH wiring during development:

```bash
bun run link
```

## Usage

```bash
counsel "Review src/auth for regression risk"
counsel --deep "Challenge this migration plan"
counsel --from claude -f prompt.md
echo "Trace the data flow in src/" | counsel
```

Flags: `-f/--file`, `--from`, `--deep`, `-o/--output-dir`, `--dry-run`, `-V/--version`

## Output

`counsel` prints the preview or result payload to stdout.

Each run writes:

```text
/tmp/counsel/<cwd-bucket>/<slug>/
├── prompt.md
├── claude.md or codex.md
└── claude.stderr or codex.stderr
```

The `<cwd-bucket>` groups runs by working directory (e.g. `personal-counsel-a1b2c3d4`).

## Requirements

- `claude` on `PATH` for Claude targets
- `codex` on `PATH` for Codex targets
- Auto-detection via `CLAUDE_CODE`, `CLAUDE_CODE_ENTRYPOINT`, `CODEX_THREAD_ID`, or `CODEX_CI`

If detection is ambiguous, pass `--from`.

## Skill

Repo skill lives in `skills/counsel/`.

## Development

```bash
bun run gate
```
