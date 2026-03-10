# Changelog

## 0.0.2

### Patch Changes

- [`4337fff`](https://github.com/cevr/counsel/commit/4337fff5a9816755f2bbd3aa9c112c04ee047ded) Thanks [@cevr](https://github.com/cevr)! - Use CLAUDE_CODE and CLAUDE_CODE_ENTRYPOINT env vars for Claude detection instead of CLAUDE_PROJECT_DIR

- [`ae4c009`](https://github.com/cevr/counsel/commit/ae4c009696d20ed776baf3896032aa45792a45cd) Thanks [@cevr](https://github.com/cevr)! - Simplify `counsel` output by printing preview and result payloads directly to stdout, writing run artifacts under `/tmp/counsel`, and tightening the live invocation runner around Effect `Clock` and `callback`.

## 0.0.1

### Patch Changes

- [`e12c730`](https://github.com/cevr/counsel/commit/e12c7303e345ad5ccaf6a3e45fbde8737c7dc336) Thanks [@cevr](https://github.com/cevr)! - Refactor the CLI runtime behind swappable Effect services so CLI and run-path tests can run in-process without live subprocess bootstrapping.

All notable changes to this project will be documented in this file.
