import type { Repository } from "./database.ts";
import { hashPrompt, type ElevenLabsGateway } from "./elevenlabs.ts";
import type { ImprovementPatch } from "../shared/types.ts";

export function applyPatch(prompt: string, patch: ImprovementPatch): string {
  if (patch.kind === "append") {
    if (!patch.text?.trim()) throw new Error("Append patch has no text.");
    return `${prompt.trimEnd()}\n\n${patch.text.trim()}\n`;
  }
  if (!patch.search || patch.replacement === undefined) {
    throw new Error("Replace patch is incomplete.");
  }
  const first = prompt.indexOf(patch.search);
  if (first < 0) throw new Error("Replace patch no longer matches the active prompt.");
  if (prompt.indexOf(patch.search, first + patch.search.length) >= 0) {
    throw new Error("Replace patch is ambiguous because the search text appears more than once.");
  }
  return `${prompt.slice(0, first)}${patch.replacement}${prompt.slice(first + patch.search.length)}`;
}

export async function publishProposal(args: {
  proposalId: string;
  repository: Repository;
  elevenLabs: ElevenLabsGateway;
}): Promise<{ deploymentId: string }> {
  const proposal = args.repository.getProposal(args.proposalId);
  if (!proposal) throw new Error("Proposal not found.");
  if (proposal.status !== "ready-for-approval") {
    throw new Error(`Proposal is ${proposal.status}, not ready-for-approval.`);
  }
  if (!proposal.patch) throw new Error("Proposal has no publishable patch.");
  const current = await args.elevenLabs.getAgent();
  if (!proposal.basePromptHash || proposal.basePromptHash !== current.promptHash) {
    throw new Error(
      "The live prompt changed after this proposal was created. Re-evaluate instead of overwriting it.",
    );
  }
  const nextPrompt = applyPatch(current.prompt, proposal.patch);
  const providerResponse = await args.elevenLabs.updatePrompt(nextPrompt);
  const deploymentId = args.repository.recordDeployment({
    proposalId: proposal.id,
    action: "publish",
    beforePrompt: current.prompt,
    beforePromptHash: current.promptHash,
    afterPrompt: nextPrompt,
    afterPromptHash: hashPrompt(nextPrompt),
    providerResponse,
  });
  args.repository.updateProposalStatus(proposal.id, "published");
  return { deploymentId };
}

export async function rollbackDeployment(args: {
  deploymentId: string;
  repository: Repository;
  elevenLabs: ElevenLabsGateway;
}): Promise<{ rollbackDeploymentId: string }> {
  const deployment = args.repository.getDeployment(args.deploymentId);
  if (!deployment) throw new Error("Deployment not found.");
  if (deployment.rolled_back_at) throw new Error("Deployment has already been rolled back.");
  const current = await args.elevenLabs.getAgent();
  if (current.promptHash !== deployment.after_prompt_hash) {
    throw new Error(
      "The live prompt no longer matches this deployment. Refusing to overwrite a newer change.",
    );
  }
  const previousPrompt = String(deployment.before_prompt);
  const providerResponse = await args.elevenLabs.updatePrompt(previousPrompt);
  const rollbackDeploymentId = args.repository.recordDeployment({
    proposalId: null,
    action: "rollback",
    beforePrompt: current.prompt,
    beforePromptHash: current.promptHash,
    afterPrompt: previousPrompt,
    afterPromptHash: hashPrompt(previousPrompt),
    providerResponse,
  });
  args.repository.markDeploymentRolledBack(args.deploymentId);
  return { rollbackDeploymentId };
}
