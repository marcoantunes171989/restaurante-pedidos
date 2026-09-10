import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { validatePrivateRequest } from "../../../../../lib/private-request-auth.js";
import { validateStartInput } from "../../../../../lib/release-input.js";
import { releaseSchedulerWorkflow } from "../../../../../workflows/release-scheduler.js";

export const runtime = "nodejs";

const PATHNAME = "/api/internal/releases/start";

export async function POST(request) {
  const secret = process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET;

  // RAW body lido antes de qualquer JSON.parse, para que a assinatura
  // valide exatamente os bytes recebidos.
  const rawBody = await request.text();

  try {
    validatePrivateRequest({
      secret,
      method: "POST",
      pathname: PATHNAME,
      timestamp: request.headers.get("x-pp-timestamp"),
      requestId: request.headers.get("x-pp-request-id"),
      signatureHeader: request.headers.get("x-pp-signature"),
      rawBody,
    });
  } catch {
    // Nunca detalhar o motivo — evita oráculo de assinatura para um atacante.
    return new NextResponse(null, { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  let input;
  try {
    input = validateStartInput(body);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.code || "INVALID_INPUT" },
      { status: 400 }
    );
  }

  const run = await start(releaseSchedulerWorkflow, [input]);

  return NextResponse.json(
    { ok: true, releaseId: input.releaseId, workflowRunId: run.runId },
    { status: 202 }
  );
}
