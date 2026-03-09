import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { DEFAULT_OUTPUT_DIR } from "../constants.js";
import { RunService } from "../services/Run.js";
import { HostService } from "../services/Host.js";
import {
  encodeDryRunPreview,
  encodeRunManifest,
  type DryRunPreview,
  type Provider,
  type RunManifest,
} from "../types.js";

const promptArgument = Argument.string("prompt").pipe(
  Argument.optional,
  Argument.withDescription("Inline prompt to send to the opposite agent"),
);

const fileFlag = Flag.file("file").pipe(
  Flag.withAlias("f"),
  Flag.optional,
  Flag.withDescription("Read the prompt from a file"),
);

const fromFlag = Flag.choice("from", ["claude", "codex"]).pipe(
  Flag.optional,
  Flag.withDescription("Override source detection"),
);

const outputDirFlag = Flag.string("output-dir").pipe(
  Flag.withAlias("o"),
  Flag.withDefault(DEFAULT_OUTPUT_DIR),
  Flag.withDescription("Base directory for run artifacts"),
);

const deepFlag = Flag.boolean("deep").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use the deeper profile"),
);

const dryRunFlag = Flag.boolean("dry-run").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Resolve the route and command without executing"),
);

const jsonFlag = Flag.boolean("json").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Emit JSON to stdout"),
);

const formatDryRun = (preview: DryRunPreview): string =>
  [
    `Source:   ${preview.source}`,
    `Target:   ${preview.target}`,
    `Profile:  ${preview.profile}`,
    `Input:    ${preview.promptSource}`,
    `Output:   ${preview.outputDir}`,
    `Prompt:   ${preview.promptFilePath}`,
    "",
    `Command:  ${[preview.invocation.cmd, ...preview.invocation.args].join(" ")}`,
  ].join("\n");

const formatRunSummary = (manifest: RunManifest): string =>
  [
    `Source:   ${manifest.source}`,
    `Target:   ${manifest.target}`,
    `Profile:  ${manifest.profile}`,
    `Status:   ${manifest.status}`,
    `Output:   ${manifest.outputFile}`,
    `Stderr:   ${manifest.stderrFile}`,
    `Manifest: ${manifest.promptFilePath.replace(/\/prompt\.md$/, "/run.json")}`,
  ].join("\n");

export const command = Command.make(
  "counsel",
  {
    prompt: promptArgument,
    file: fileFlag,
    from: fromFlag,
    outputDir: outputDirFlag,
    deep: deepFlag,
    dryRun: dryRunFlag,
    json: jsonFlag,
  },
  ({ prompt, file, from, outputDir, deep, dryRun, json }) =>
    Effect.gen(function* () {
      const run = yield* RunService;
      const host = yield* HostService;
      const stdinText =
        Option.isNone(prompt) && Option.isNone(file) ? yield* host.readPipedStdin() : undefined;
      const cwd = yield* host.getCwd();

      if (!json && !dryRun) {
        yield* Console.error("Routing prompt to the opposite agent...");
      }

      const result = yield* run.run({
        cwd,
        prompt,
        file,
        stdinText,
        from: from as Option.Option<Provider>,
        deep,
        outputDir,
        dryRun,
      });

      if (result._tag === "DryRun") {
        if (json) {
          const encoded = yield* encodeDryRunPreview(result.preview);
          yield* Console.log(encoded);
          return;
        }

        yield* Console.error(formatDryRun(result.preview));
        return;
      }

      if (json) {
        const encoded = yield* encodeRunManifest(result.manifest);
        yield* Console.log(encoded);
      } else {
        yield* Console.error(formatRunSummary(result.manifest));
      }

      if (result.manifest.status === "timeout") {
        yield* host.setExitCode(124);
      } else if (result.manifest.status !== "success") {
        yield* host.setExitCode(1);
      }
    }),
).pipe(
  Command.withDescription("Route a prompt to the opposite local coding agent"),
  Command.withExamples([
    {
      command: 'counsel "Review the auth refactor for blind spots"',
      description: "Send an inline prompt to the opposite agent",
    },
    {
      command: "counsel --deep -f prompt.md",
      description: "Run the deeper profile with a prompt file",
    },
    {
      command: 'echo "Challenge this migration plan" | counsel',
      description: "Read the prompt from stdin",
    },
  ]),
);
