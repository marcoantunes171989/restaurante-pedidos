import { sleep } from "workflow";
import { executeScheduledRelease } from "../server/release-core.js";

export async function scheduledReleaseWorkflow(input) {
  "use workflow";
  await sleep(new Date(input.scheduledAt));
  return await executeScheduledReleaseStep(input);
}

export async function executeScheduledReleaseStep(input) {
  "use step";
  const { releaseId, baseSha, targetSha, scheduledAt } = input;
  return executeScheduledRelease({ releaseId, baseSha, targetSha, scheduledAt });
}
