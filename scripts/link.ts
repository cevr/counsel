// @effect-diagnostics effect/nodeBuiltinImport:off
import { lstatSync, mkdirSync, symlinkSync, unlinkSync } from "fs";
import * as os from "node:os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const binaryPath = join(rootDir, "bin", "counsel");
const bunBinDir = join(process.env["HOME"] ?? os.homedir(), ".bun", "bin");
const bunBinPath = join(bunBinDir, "counsel");

mkdirSync(bunBinDir, { recursive: true });

try {
  lstatSync(bunBinPath);
  unlinkSync(bunBinPath);
} catch {
  // doesn't exist
}

symlinkSync(binaryPath, bunBinPath);
console.log(`Symlinked to: ${bunBinPath}`);
