import { Effect, Layer, Option, ServiceMap } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import type { PlatformError } from "effect/PlatformError";
import { DEFAULT_TIMEOUT_SECONDS, KILL_GRACE_PERIOD_MS } from "../constants.js";
import { CounselError, ErrorCode, isCounselError } from "../errors/index.js";
import { AgentPlatformService } from "./AgentPlatform.js";
import type { DryRunPreview, Invocation, Profile, Provider, RunManifest } from "../types.js";
import { encodeRunManifest } from "../types.js";

export type RunInput = {
  readonly cwd: string;
  readonly prompt: Option.Option<string>;
  readonly file: Option.Option<string>;
  readonly stdinText?: string | undefined;
  readonly from: Option.Option<Provider>;
  readonly deep: boolean;
  readonly outputDir: string;
  readonly dryRun: boolean;
};

export type RunResult =
  | { readonly _tag: "DryRun"; readonly preview: DryRunPreview }
  | { readonly _tag: "Completed"; readonly manifest: RunManifest };

const trimToOption = (text: string | undefined): Option.Option<string> =>
  text !== undefined && text.trim().length > 0 ? Option.some(text) : Option.none();

const promptConflict = Effect.fail(
  new CounselError({
    message: "Provide exactly one prompt source: inline arg, --file, or stdin.",
    code: ErrorCode.PROMPT_CONFLICT,
  }),
);

export const generateSlug = (
  source: Provider,
  target: Provider,
  now: Date = new Date(),
): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = [String(now.getFullYear()), pad(now.getMonth() + 1), pad(now.getDate())].join("");
  const time = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${stamp}-${time}-${source}-to-${target}-${suffix}`;
};

export class RunService extends ServiceMap.Service<
  RunService,
  {
    readonly run: (input: RunInput) => Effect.Effect<RunResult, CounselError>;
  }
>()("@cvr/counsel/services/Run/RunService") {
  static layer: Layer.Layer<RunService, never, AgentPlatformService | FileSystem | Path> =
    Layer.effect(
      RunService,
      Effect.gen(function* () {
        const fs = yield* FileSystem;
        const path = yield* Path;
        const platform = yield* AgentPlatformService;

        const resolvePromptInput = Effect.fn("RunService.resolvePromptInput")(function* (
          cwd: string,
          prompt: Option.Option<string>,
          file: Option.Option<string>,
          stdinText?: string,
        ) {
          const stdin = trimToOption(stdinText);
          const sources = [Option.isSome(prompt), Option.isSome(file), Option.isSome(stdin)].filter(
            Boolean,
          );

          if (sources.length > 1) {
            return yield* promptConflict;
          }

          if (Option.isSome(prompt)) {
            return { content: prompt.value, promptSource: "inline" as const };
          }

          if (Option.isSome(file)) {
            const filePath = path.resolve(cwd, file.value);
            const content = yield* fs.readFileString(filePath).pipe(
              Effect.mapError(
                (error: PlatformError) =>
                  new CounselError({
                    message: `Failed to read prompt file ${filePath}: ${error.message}`,
                    code: ErrorCode.FILE_READ_FAILED,
                  }),
              ),
            );
            return { content, promptSource: "file" as const };
          }

          if (Option.isSome(stdin)) {
            return { content: stdin.value, promptSource: "stdin" as const };
          }

          return yield* new CounselError({
            message: "Missing prompt. Pass an inline prompt, --file, or pipe stdin.",
            code: ErrorCode.PROMPT_MISSING,
          });
        });

        const writeTextFile = Effect.fn("RunService.writeTextFile")(function* (
          filePath: string,
          content: string,
        ) {
          yield* fs.writeFileString(filePath, content).pipe(
            Effect.mapError(
              (error: PlatformError) =>
                new CounselError({
                  message: `Failed to write ${filePath}: ${error.message}`,
                  code: ErrorCode.WRITE_FAILED,
                }),
            ),
          );
        });

        const executeInvocation = Effect.fn("RunService.executeInvocation")(function* (
          invocation: Invocation,
          outputFile: string,
          stderrFile: string,
          timeoutSeconds: number = DEFAULT_TIMEOUT_SECONDS,
        ) {
          const pipeStreamToFile = async (
            stream: ReadableStream<Uint8Array> | null,
            filePath: string,
          ): Promise<void> => {
            const sink = Bun.file(filePath).writer();
            let ended = false;
            const endSink = async () => {
              if (ended) {
                return;
              }
              ended = true;
              await sink.end();
            };

            if (stream === null) {
              await endSink();
              return;
            }

            try {
              await stream.pipeTo(
                new WritableStream<Uint8Array>({
                  write: async (chunk) => {
                    await sink.write(chunk);
                  },
                  close: async () => {
                    await endSink();
                  },
                  abort: async () => {
                    await endSink();
                  },
                }),
              );
            } catch (error) {
              await endSink();
              throw error;
            } finally {
              await endSink();
            }
          };

          return yield* Effect.tryPromise({
            try: async () => {
              const startedAt = Date.now();
              let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
              try {
                proc = Bun.spawn([invocation.cmd, ...invocation.args], {
                  cwd: invocation.cwd,
                  stdin: "ignore",
                  stdout: "pipe",
                  stderr: "pipe",
                });
              } catch (error) {
                throw new CounselError({
                  message: error instanceof Error ? error.message : String(error),
                  code: ErrorCode.SPAWN_FAILED,
                });
              }

              const stdoutWrite = pipeStreamToFile(proc.stdout, outputFile);
              const stderrWrite = pipeStreamToFile(proc.stderr, stderrFile);

              let timedOut = false;
              let forceKill: ReturnType<typeof setTimeout> | undefined;
              const timeout = setTimeout(() => {
                timedOut = true;
                proc.kill("SIGTERM");
                forceKill = setTimeout(() => {
                  proc.kill("SIGKILL");
                }, KILL_GRACE_PERIOD_MS);
              }, timeoutSeconds * 1_000);

              try {
                const exitCode = await proc.exited;
                try {
                  await Promise.all([stdoutWrite, stderrWrite]);
                } catch (error) {
                  throw new CounselError({
                    message: error instanceof Error ? error.message : String(error),
                    code: ErrorCode.WRITE_FAILED,
                  });
                }

                return {
                  exitCode,
                  durationMs: Date.now() - startedAt,
                  timedOut,
                };
              } finally {
                clearTimeout(timeout);
                if (forceKill !== undefined) {
                  clearTimeout(forceKill);
                }
              }
            },
            catch: (error) =>
              isCounselError(error)
                ? error
                : new CounselError({
                    message: error instanceof Error ? error.message : String(error),
                    code: ErrorCode.SPAWN_FAILED,
                  }),
          });
        });

        const run = Effect.fn("RunService.run")(function* (input: RunInput) {
          const promptInput = yield* resolvePromptInput(
            input.cwd,
            input.prompt,
            input.file,
            input.stdinText,
          );

          const source = yield* platform.resolveSource(input.from);
          const target = platform.resolveTarget(source);
          const profile: Profile = input.deep ? "deep" : "standard";
          const slug = generateSlug(source, target);
          const outputDir = path.resolve(input.cwd, input.outputDir, slug);
          const promptFilePath = path.join(outputDir, "prompt.md");
          const invocation = yield* platform.buildInvocation(
            target,
            promptFilePath,
            profile,
            input.cwd,
          );

          if (input.dryRun) {
            return {
              _tag: "DryRun" as const,
              preview: {
                source,
                target,
                profile,
                promptSource: promptInput.promptSource,
                outputDir,
                promptFilePath,
                invocation: {
                  cmd: invocation.cmd,
                  args: [...invocation.args],
                  cwd: invocation.cwd,
                },
              },
            };
          }

          yield* fs.makeDirectory(outputDir, { recursive: true }).pipe(
            Effect.mapError(
              (error: PlatformError) =>
                new CounselError({
                  message: `Failed to create ${outputDir}: ${error.message}`,
                  code: ErrorCode.WRITE_FAILED,
                }),
            ),
          );

          yield* writeTextFile(promptFilePath, promptInput.content);

          const outputFile = path.join(outputDir, `${target}.md`);
          const stderrFile = path.join(outputDir, `${target}.stderr`);
          const executed = yield* executeInvocation(invocation, outputFile, stderrFile);

          const manifest: RunManifest = {
            timestamp: new Date().toISOString(),
            slug,
            cwd: input.cwd,
            promptSource: promptInput.promptSource,
            source,
            target,
            profile,
            status: executed.timedOut ? "timeout" : executed.exitCode === 0 ? "success" : "error",
            exitCode: executed.exitCode,
            durationMs: executed.durationMs,
            promptFilePath,
            outputFile,
            stderrFile,
          };

          const manifestJson = yield* encodeRunManifest(manifest).pipe(
            Effect.mapError(
              (error) =>
                new CounselError({
                  message: `Failed to encode run manifest: ${error.message}`,
                  code: ErrorCode.WRITE_FAILED,
                }),
            ),
          );
          yield* writeTextFile(path.join(outputDir, "run.json"), `${manifestJson}\n`);

          return { _tag: "Completed" as const, manifest };
        });

        return { run };
      }),
    );
}
