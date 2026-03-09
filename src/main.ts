#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { runCounsel } from "./program.js";
import { AgentPlatformService } from "./services/AgentPlatform.js";
import { HostService } from "./services/Host.js";
import { InvocationRunnerService } from "./services/InvocationRunner.js";
import { RunService } from "./services/Run.js";

const AgentPlatformLayer = AgentPlatformService.layer.pipe(Layer.provide(HostService.layer));

const ServiceLayer = RunService.layer.pipe(
  Layer.provideMerge(InvocationRunnerService.layer),
  Layer.provideMerge(AgentPlatformLayer),
  Layer.provideMerge(HostService.layer),
  Layer.provideMerge(BunServices.layer),
);

// @effect-diagnostics-next-line effect/strictEffectProvide:off
BunRuntime.runMain(runCounsel(process.argv.slice(2)).pipe(Effect.provide(ServiceLayer)), {
  disableErrorReporting: true,
});
