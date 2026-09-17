import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundledPython = resolve(dirname(process.execPath), "../../python/bin/python3");
const cachedBundledPython = resolve(
  homedir(),
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
);
const candidates = [...new Set([
  process.env.PDF_PYTHON,
  bundledPython,
  cachedBundledPython,
  "python3",
].filter(Boolean))];

let python = null;
for (const candidate of candidates) {
  const check = spawnSync(candidate, ["-c", "import reportlab, pypdf"], {
    cwd: root,
    stdio: "ignore",
  });
  if (check.status === 0) {
    python = candidate;
    break;
  }
}

if (!python) {
  console.error("Unable to find Python with reportlab and pypdf. Set PDF_PYTHON to a compatible interpreter.");
  process.exit(1);
}

const generated = spawnSync(python, ["scripts/generate_3v_field_reference_pdf.py"], {
  cwd: root,
  stdio: "inherit",
});

if (generated.error) throw generated.error;
process.exit(generated.status ?? 1);
