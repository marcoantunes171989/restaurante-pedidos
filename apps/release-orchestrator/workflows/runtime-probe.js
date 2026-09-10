export async function runtimeProbeWorkflow(probeId) {
  "use workflow";

  const result = await probeStep(probeId);
  return result;
}

async function probeStep(probeId) {
  "use step";

  return { ok: true, probeId };
}
