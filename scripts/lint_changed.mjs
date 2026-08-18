import { execFileSync, spawnSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const baseRef = process.env.LINT_BASE_REF || "origin/master";
let base;

try {
  base = git(["merge-base", "HEAD", baseRef]);
} catch {
  base = git(["rev-parse", "HEAD^"]);
}

const committed = git(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]);
const workingTree = git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]);
const untracked = git(["ls-files", "--others", "--exclude-standard"]);
const files = [...new Set(`${committed}\n${workingTree}\n${untracked}`.split("\n"))]
  .filter((file) => /\.(?:js|jsx|mjs|cjs)$/.test(file));

if (files.length === 0) {
  console.log("Lint incremental: nenhum arquivo JavaScript alterado.");
  process.exit(0);
}

console.log(`Lint incremental: ${files.length} arquivo(s).`);
const result = spawnSync("npx", ["eslint", "--max-warnings=0", ...files], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
