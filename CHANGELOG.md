# Changelog

## 0.1.0

### Minor Changes

- [`e8bc5f7`](https://github.com/cevr/counsel/commit/e8bc5f783b7844645fd88200e4451ebb503eab42) Thanks [@cevr](https://github.com/cevr)! - Group output artifacts by working directory using a deterministic cwd bucket (`<segments>-<hash>`). Adds `outputBucket` field to both `RunManifest` and `DryRunPreview` stdout payloads.

## 0.0.3

### Patch Changes

- [`1a5a6a0`](https://github.com/cevr/counsel/commit/1a5a6a00634670342e22b16b4d1360ba16c9504e) Thanks [@cevr](https://github.com/cevr)! - Bump Codex deep profile reasoning effort from high to xhigh

## 0.0.2

### Patch Changes

- [`4337fff`](https://github.com/cevr/counsel/commit/4337fff5a9816755f2bbd3aa9c112c04ee047ded) Thanks [@cevr](https://github.com/cevr)! - Use CLAUDE_CODE and CLAUDE_CODE_ENTRYPOINT env vars for Claude detection instead of CLAUDE_PROJECT_DIR

- [`ae4c009`](https://github.com/cevr/counsel/commit/ae4c009696d20ed776baf3896032aa45792a45cd) Thanks [@cevr](https://github.com/cevr)! - Simplify `counsel` output by printing preview and result payloads directly to stdout, writing run artifacts under `/tmp/counsel`, and tightening the live invocation runner around Effect `Clock` and `callback`.

## 0.0.1

### Patch Changes

- [`e12c730`](https://github.com/cevr/counsel/commit/e12c7303e345ad5ccaf6a3e45fbde8737c7dc336) Thanks [@cevr](https://github.com/cevr)! - Refactor the CLI runtime behind swappable Effect services so CLI and run-path tests can run in-process without live subprocess bootstrapping.

All notable changes to this project will be documented in this file.
