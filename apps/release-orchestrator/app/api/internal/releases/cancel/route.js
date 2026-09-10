import { NextResponse } from "next/server";
import { getRun } from "workflow/api";
import { validatePrivateRequest } from "../../../../../lib/private-request-auth.js";
import { validateCancelInput } from "../../../../../lib/release-input.js";

export const runtime = "nodejs";

const PATHNAME = "/api/internal/releases/cancel";

export async function POST(request) {
  const secret = process.env.RELEASE_ORCHESTRATOR_HMAC_SECRET;

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
    input = validateCancelInput(body);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.code || "INVALID_INPUT" },
      { status: 400 }
    );
  }

  try {
    const run = getRun(input.workflowRunId);
    await run.cancel();
  } catch {
    // Não inventamos o formato de erro do SDK — respondemos sanitizado.
    return NextResponse.json({ ok: false, error: "CANCEL_FAILED" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, releaseId: input.releaseId }, { status: 200 });
}
