/** @effect-diagnostics effect/strictEffectProvide:skip-file effect/preferSchemaOverJson:skip-file */
import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "effect-bun-test";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { VERSION } from "../src/constants.js";

type CliResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
};

type RunCliOptions = {
  readonly env?: Record<string, string | undefined>;
  readonly stdinMode?: "ignore" | "pipe";
  readonly stdinText?: string;
  readonly closeStdin?: boolean;
  readonly timeoutMs?: number;
};

const REPO_ROOT = "/Users/cvr/Developer/personal/counsel";

const writeExecutable = (filePath: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    yield* fs.writeFileString(filePath, content);
    yield* fs.chmod(filePath, 0o755);
  });

const runCli = (args: ReadonlyArray<string>, options: RunCliOptions = {}) =>
  Effect.promise(async (): Promise<CliResult> => {
    const stdinMode = options.stdinMode ?? (options.stdinText === undefined ? "ignore" : "pipe");
    const proc = Bun.spawn(["bun", "run", "src/main.ts", ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...options.env },
      stdin: stdinMode,
      stdout: "pipe",
      stderr: "pipe",
    });

    if (stdinMode === "pipe" && proc.stdin != null) {
      if (options.stdinText !== undefined) {
        proc.stdin.write(options.stdinText);
      }
      if (options.closeStdin ?? options.stdinText !== undefined) {
        proc.stdin.end();
      }
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const exitResult = await Promise.race([
      proc.exited.then((exitCode) => ({ exitCode, timedOut: false as const })),
      new Promise<{ readonly exitCode: number; readonly timedOut: true }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          proc.kill("SIGKILL");
          void proc.exited.then((exitCode) => resolve({ exitCode, timedOut: true }));
        }, options.timeoutMs ?? 1_500);
      }),
    ]);
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }

    const [stdout, stderr] = await Promise.all([
      proc.stdout === null ? Promise.resolve("") : new Response(proc.stdout).text(),
      proc.stderr === null ? Promise.resolve("") : new Response(proc.stderr).text(),
    ]);

    return { ...exitResult, stdout, stderr };
  });

describe("counsel CLI", () => {
  it.scopedLive("prints a JSON dry-run preview", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const path = yield* Path;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "counsel-cli-test-" });
      const binDir = path.join(cwd, "bin");
      yield* fs.makeDirectory(binDir, { recursive: true });
      yield* writeExecutable(
        path.join(binDir, "codex"),
        "#!/usr/bin/env bash\nprintf 'codex placeholder\\n'\n",
      );

      const result = yield* runCli(["--from", "claude", "--dry-run", "--json", "review this"], {
        env: { PATH: `${binDir}:${process.env["PATH"] ?? ""}` },
      });

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      const preview = JSON.parse(result.stdout);
      expect(preview.source).toBe("claude");
      expect(preview.target).toBe("codex");
      expect(preview.invocation.cmd).toContain("codex");
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.scopedLive("runs the opposite agent and writes run artifacts", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const path = yield* Path;
      const execDir = yield* fs.makeTempDirectoryScoped({ prefix: "counsel-cli-test-" });
      const binDir = path.join(execDir, "bin");
      const outputDir = path.join(execDir, "out");
      yield* fs.makeDirectory(binDir, { recursive: true });
      yield* writeExecutable(
        path.join(binDir, "claude"),
        "#!/usr/bin/env bash\nprintf 'claude called: %s\\n' \"$*\"\nprintf 'stderr line\\n' >&2\n",
      );

      const result = yield* runCli(
        ["--from", "codex", "--json", "--output-dir", outputDir, "challenge the migration plan"],
        { env: { PATH: `${binDir}:${process.env["PATH"] ?? ""}` } },
      );

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);

      const manifest = JSON.parse(result.stdout);
      const outputText = yield* fs.readFileString(manifest.outputFile);
      const stderrText = yield* fs.readFileString(manifest.stderrFile);
      const promptText = yield* fs.readFileString(manifest.promptFilePath);

      expect(manifest.source).toBe("codex");
      expect(manifest.target).toBe("claude");
      expect(outputText).toContain("claude called:");
      expect(stderrText).toContain("stderr line");
      expect(promptText).toBe("challenge the migration plan");
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.live("returns a usage error when source detection is ambiguous", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["--json", "review this"], {
        env: {
          CLAUDE_PROJECT_DIR: undefined,
          CODEX_THREAD_ID: undefined,
          CODEX_CI: undefined,
        },
      });

      expect(result.exitCode).toBe(2);
      expect(result.timedOut).toBe(false);
      const error = JSON.parse(result.stdout);
      expect(error.code).toBe("AMBIGUOUS_PROVIDER");
    }),
  );

  it.live("emits JSON for invalid --from values", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["--json", "--from", "nope", "review this"]);

      expect(result.exitCode).toBe(2);
      expect(result.timedOut).toBe(false);
      const error = JSON.parse(result.stdout);
      expect(error.code).toBe("CLI_USAGE_ERROR");
      expect(error.message).toContain("Invalid value for flag --from");
    }),
  );

  it.live("emits JSON for unknown flags", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["--json", "--bogus", "review this"]);

      expect(result.exitCode).toBe(2);
      expect(result.timedOut).toBe(false);
      const error = JSON.parse(result.stdout);
      expect(error.code).toBe("CLI_USAGE_ERROR");
      expect(error.message).toContain("Unrecognized flag");
    }),
  );

  it.live("supports -V as a version alias", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["-V"]);

      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.stdout.trim()).toBe(`counsel v${VERSION}`);
    }),
  );

  it.scopedLive("ignores an open stdin pipe when an inline prompt is provided", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem;
      const path = yield* Path;
      const cwd = yield* fs.makeTempDirectoryScoped({ prefix: "counsel-cli-test-" });
      const binDir = path.join(cwd, "bin");
      yield* fs.makeDirectory(binDir, { recursive: true });
      yield* writeExecutable(
        path.join(binDir, "codex"),
        "#!/usr/bin/env bash\nprintf 'codex placeholder\\n'\n",
      );

      const result = yield* runCli(["--from", "claude", "--dry-run", "--json", "review this"], {
        env: { PATH: `${binDir}:${process.env["PATH"] ?? ""}` },
        stdinMode: "pipe",
        closeStdin: false,
        timeoutMs: 1_000,
      });

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      const preview = JSON.parse(result.stdout);
      expect(preview.promptSource).toBe("inline");
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
