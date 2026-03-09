/** @effect-diagnostics effect/strictEffectProvide:skip-file effect/preferSchemaOverJson:skip-file */
import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "effect-bun-test";
import { Console, Effect, Layer, Option } from "effect";
import { VERSION } from "../src/constants.js";
import { CounselError, ErrorCode } from "../src/errors/index.js";
import { runCounsel } from "../src/program.js";
import { HostService } from "../src/services/Host.js";
import type { RunInput, RunResult } from "../src/services/Run.js";
import { RunService } from "../src/services/Run.js";

type CliResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly runInputs: ReadonlyArray<RunInput>;
  readonly stdinReadCount: number;
};

type RunCliOptions = {
  readonly env?: Record<string, string | undefined>;
  readonly cwd?: string;
  readonly stdinText?: string | undefined;
  readonly runImpl?: (input: RunInput) => Effect.Effect<RunResult, CounselError>;
};

const stripAnsi = (text: string): string => {
  let output = "";
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char === undefined) {
      break;
    }

    if (char.charCodeAt(0) === 27 && text[index + 1] === "[") {
      index += 2;
      while (index < text.length) {
        const marker = text[index];
        if (marker === undefined) {
          break;
        }
        index += 1;
        if (marker === "m") {
          break;
        }
      }
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
};

const defaultPreview = (): RunResult => ({
  _tag: "DryRun",
  preview: {
    source: "claude",
    target: "codex",
    profile: "standard",
    promptSource: "inline",
    outputDir: "/tmp/counsel/demo",
    promptFilePath: "/tmp/counsel/demo/prompt.md",
    invocation: {
      cmd: "codex",
      args: ["exec", "Read the file"],
      cwd: "/tmp/counsel",
    },
  },
});

const defaultManifest = (): RunResult => ({
  _tag: "Completed",
  manifest: {
    timestamp: "2026-03-08T00:00:00.000Z",
    slug: "demo-run",
    cwd: "/tmp/counsel",
    promptSource: "inline",
    source: "codex",
    target: "claude",
    profile: "deep",
    status: "success",
    exitCode: 0,
    durationMs: 42,
    promptFilePath: "/tmp/counsel/demo-run/prompt.md",
    outputFile: "/tmp/counsel/demo-run/claude.md",
    stderrFile: "/tmp/counsel/demo-run/claude.stderr",
  },
});

const testConsoleLayer = (stdout: Array<string>, stderr: Array<string>) =>
  Layer.succeed(Console.Console, {
    assert: () => undefined,
    clear: () => undefined,
    count: () => undefined,
    countReset: () => undefined,
    debug: (...args) => {
      stdout.push(args.map(String).join(" "));
    },
    dir: (item) => {
      stdout.push(String(item));
    },
    dirxml: (...args) => {
      stdout.push(args.map(String).join(" "));
    },
    error: (...args) => {
      stderr.push(args.map(String).join(" "));
    },
    group: (...args) => {
      stderr.push(args.map(String).join(" "));
    },
    groupCollapsed: (...args) => {
      stderr.push(args.map(String).join(" "));
    },
    groupEnd: () => undefined,
    info: (...args) => {
      stdout.push(args.map(String).join(" "));
    },
    log: (...args) => {
      stdout.push(args.map(String).join(" "));
    },
    table: (tabularData) => {
      stdout.push(String(tabularData));
    },
    time: () => undefined,
    timeEnd: () => undefined,
    timeLog: (...args) => {
      stdout.push(args.map(String).join(" "));
    },
    trace: (...args) => {
      stderr.push(args.map(String).join(" "));
    },
    warn: (...args) => {
      stderr.push(args.map(String).join(" "));
    },
  });

const runCli = (args: ReadonlyArray<string>, options: RunCliOptions = {}) =>
  Effect.gen(function* () {
    const stdout: Array<string> = [];
    const stderr: Array<string> = [];
    const runInputs: Array<RunInput> = [];
    let exitCode = 0;
    let stdinReadCount = 0;

    const hostLayer = HostService.layerTest({
      getCwd: () => Effect.succeed(options.cwd ?? "/tmp/counsel"),
      getEnv: () => Effect.succeed(options.env ?? {}),
      readPipedStdin: () => {
        stdinReadCount += 1;
        return Effect.succeed(options.stdinText);
      },
      setExitCode: (code) =>
        Effect.sync(() => {
          exitCode = code;
        }),
    });

    const runLayer = Layer.succeed(RunService, {
      run: (input) => {
        runInputs.push(input);
        return options.runImpl !== undefined
          ? options.runImpl(input)
          : Effect.succeed(defaultPreview());
      },
    });

    yield* runCounsel(args).pipe(
      Effect.provide(
        Layer.mergeAll(BunServices.layer, testConsoleLayer(stdout, stderr), hostLayer, runLayer),
      ),
    );

    return {
      exitCode,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
      runInputs,
      stdinReadCount,
    } satisfies CliResult;
  });

describe("counsel CLI", () => {
  it.effect("prints a dry-run preview payload", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["--from", "claude", "--dry-run", "review this"]);

      expect(result.exitCode).toBe(0);
      const preview = JSON.parse(result.stdout);
      expect(preview.source).toBe("claude");
      expect(preview.target).toBe("codex");
      expect(preview.invocation.cmd).toBe("codex");
      expect(preview.outputDir).toBe("/tmp/counsel/demo");
      expect(Option.isSome(result.runInputs[0]?.prompt ?? Option.none())).toBe(true);
    }),
  );

  it.effect("prints progress and a completed run payload", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["--from", "codex", "challenge the migration plan"], {
        runImpl: () => Effect.succeed(defaultManifest()),
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Routing prompt to the opposite agent...");
      const manifest = JSON.parse(result.stdout);
      expect(manifest.status).toBe("success");
      expect(manifest.outputFile).toBe("/tmp/counsel/demo-run/claude.md");
    }),
  );

  it.effect("prints a structured error when source detection is ambiguous", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["review this"], {
        runImpl: () =>
          Effect.fail(
            new CounselError({
              message: "Cannot infer the current agent. Pass --from claude or --from codex.",
              code: ErrorCode.AMBIGUOUS_PROVIDER,
            }),
          ),
      });

      expect(result.exitCode).toBe(2);
      const error = JSON.parse(result.stdout);
      expect(error.code).toBe("AMBIGUOUS_PROVIDER");
    }),
  );

  it.effect("prints a structured error for invalid --from values", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["--from", "nope", "review this"]);

      expect(result.exitCode).toBe(2);
      const error = JSON.parse(result.stdout);
      expect(error.code).toBe("CLI_USAGE_ERROR");
      expect(error.message).toContain("Invalid value for flag --from");
    }),
  );

  it.effect("prints a structured error for unknown flags", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["--bogus", "review this"]);

      expect(result.exitCode).toBe(2);
      const error = JSON.parse(result.stdout);
      expect(error.code).toBe("CLI_USAGE_ERROR");
      expect(error.message).toContain("Unrecognized flag");
    }),
  );

  it.effect("supports -V as a version alias", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["-V"]);

      expect(result.exitCode).toBe(0);
      expect(stripAnsi(result.stdout).trim()).toBe(`counsel v${VERSION}`);
    }),
  );

  it.effect("does not read stdin when an inline prompt is provided", () =>
    Effect.gen(function* () {
      const result = yield* runCli(["--from", "claude", "--dry-run", "review this"], {
        stdinText: "ignored stdin",
      });

      expect(result.stdinReadCount).toBe(0);
      expect(result.runInputs).toHaveLength(1);
      expect(result.runInputs[0]?.stdinText).toBeUndefined();
    }),
  );
});
