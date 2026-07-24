#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(process.cwd());
const stdin = readFileSync(0, "utf8");

function deftCommand() {
  for (const candidate of ["deft", "directive"]) {
    const probe = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      stdio: "ignore",
      shell: process.platform === "win32",
      windowsHide: true,
    });
    if (probe.error === undefined && probe.status === 0) return candidate;
  }
  process.stderr.write(
    "Directive ApplyPatch adapter: neither deft nor directive is on PATH.\n",
  );
  process.exit(2);
}

const cli = deftCommand();
const result = spawnSync(
  cli,
  [
    "hook:dispatch",
    "--host",
    "cursor",
    "--event",
    "tool.before",
    "--project-root",
    projectRoot,
  ],
  {
    input: stdin,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
    windowsHide: true,
  },
);

if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  process.stderr.write(String(result.error));
  process.exit(2);
}
if (result.status !== 0 && result.status !== null) {
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.status);
}
// Cursor failClosed treats empty stdout as failure — normalize allow.
const out = (result.stdout ?? "").trim();
process.stdout.write((out.length > 0 ? out : '{"permission":"allow"}') + "\n");
process.exit(0);
