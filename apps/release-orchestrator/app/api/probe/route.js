import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { runtimeProbeWorkflow } from "../../../workflows/runtime-probe.js";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const probeId = crypto.randomUUID();

  const run = await start(runtimeProbeWorkflow, [probeId]);

  return NextResponse.json({
    ok: true,
    probeId,
    workflowRunId: run?.runId ?? run?.id ?? null,
  });
}
