import { Effect, Layer, ServiceMap } from "effect";
import { DEFAULT_TIMEOUT_SECONDS, KILL_GRACE_PERIOD_MS } from "../constants.js";
import { CounselError, ErrorCode, isCounselError } from "../errors/index.js";
import type { ExecutionResult, Invocation } from "../types.js";

export class InvocationRunnerService extends ServiceMap.Service<
  InvocationRunnerService,
  {
    readonly execute: (
      invocation: Invocation,
      outputFile: string,
      stderrFile: string,
      timeoutSeconds?: number,
    ) => Effect.Effect<ExecutionResult, CounselError>;
  }
>()("@cvr/counsel/services/InvocationRunner/InvocationRunnerService") {
  static layer: Layer.Layer<InvocationRunnerService> = Layer.succeed(InvocationRunnerService, {
    execute: (invocation, outputFile, stderrFile, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS) =>
      Effect.tryPromise({
        try: async () => {
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
      }),
  });

  static layerTest = (
    impl: Partial<ServiceMap.Service.Shape<typeof InvocationRunnerService>> = {},
  ): Layer.Layer<InvocationRunnerService> =>
    Layer.succeed(InvocationRunnerService, {
      execute: () =>
        Effect.succeed({
          exitCode: 0,
          durationMs: 0,
          timedOut: false,
        }),
      ...impl,
    });
}
