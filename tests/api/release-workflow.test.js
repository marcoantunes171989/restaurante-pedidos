/* global process */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ════════════════════════════════════════════════════════════
// Microgate RELEASE-AUTO-06K — least privilege no workflow de
// producao. Garante que o job que roda codigo da aplicacao
// (validate) nunca tem contents: write / git push, e que o job
// que promove main (promote) nao executa build/test da aplicacao.
// ════════════════════════════════════════════════════════════

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(
  __dirname,
  "../../.github/workflows/vercel-production-deploy.yml",
);
const workflow = readFileSync(workflowPath, "utf8");

function jobBlock(source, jobName, nextJobNames) {
  const startMatch = source.match(new RegExp(`^  ${jobName}:\\n`, "m"));
  if (!startMatch) {
    throw new Error(`job "${jobName}" nao encontrado no workflow`);
  }
  const start = startMatch.index + startMatch[0].length;

  let end = source.length;
  for (const other of nextJobNames) {
    const otherMatch = source.slice(start).match(new RegExp(`^  ${other}:\\n`, "m"));
    if (otherMatch) {
      end = Math.min(end, start + otherMatch.index);
    }
  }

  return source.slice(start, end);
}

const validateJob = jobBlock(workflow, "validate", ["promote"]);
const promoteJob = jobBlock(workflow, "promote", []);

describe("vercel-production-deploy.yml — least privilege", () => {
  it("job validate declara permissions contents: read", () => {
    expect(validateJob).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });

  it("job promote declara permissions contents: write", () => {
    expect(promoteJob).toMatch(/permissions:\s*\n\s*contents:\s*write/);
  });

  it("job promote depende de validate (needs: validate)", () => {
    expect(promoteJob).toMatch(/^\s*needs:\s*validate\s*$/m);
  });

  it("job validate nao executa git push", () => {
    expect(validateJob).not.toMatch(/git push/);
  });

  it("job promote executa o push exato para refs/heads/main", () => {
    expect(promoteJob).toMatch(
      /git push origin "\$\{RELEASE_SHA\}:refs\/heads\/main"/,
    );
  });

  it("job promote nao executa npm ci, npm test ou npm run build", () => {
    expect(promoteJob).not.toMatch(/npm ci/);
    expect(promoteJob).not.toMatch(/npm test/);
    expect(promoteJob).not.toMatch(/npm run build/);
  });

  it("job validate executa npm ci, npm test e npm run build", () => {
    expect(validateJob).toMatch(/npm ci/);
    expect(validateJob).toMatch(/npm test/);
    expect(validateJob).toMatch(/npm run build/);
  });

  it("workflow nao contem --force em nenhum push", () => {
    expect(workflow).not.toMatch(/--force/);
    expect(workflow).not.toMatch(/push origin \+/);
  });

  it("workflow nao contem comando vercel --prod", () => {
    expect(workflow).not.toMatch(/vercel --prod/);
  });

  it("preserva workflow_dispatch com release_sha, base_sha, confirmation e request_id", () => {
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/release_sha:/);
    expect(workflow).toMatch(/base_sha:/);
    expect(workflow).toMatch(/confirmation:/);
    expect(workflow).toMatch(/request_id:/);
  });

  it("preserva concurrency pedido-prime-production sem cancel-in-progress", () => {
    expect(workflow).toMatch(/group:\s*pedido-prime-production/);
    expect(workflow).toMatch(/cancel-in-progress:\s*false/);
  });
});
