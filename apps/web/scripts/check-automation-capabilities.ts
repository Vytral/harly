import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ACTION_TOOL_MANIFESTS_V2 } from "../src/features/automations/tool-manifests-v2";

// Resolved from the script location, not process.cwd(), so the check works
// from any working directory (local pnpm, CI job, editor task).
const scriptDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(scriptDir, "..");
const repoDir = resolve(webDir, "..");
const outputPath = resolve(
  repoDir,
  "docs/product/automation-capability-matrix.generated.mdx",
);
const registryPath = resolve(
  webDir,
  "src/features/automations/registry.ts",
);
const toolsPath = resolve(webDir, "src/lib/ai/agent/tools.ts");
const routingPath = resolve(webDir, "src/lib/ai/agent/tool-routing.ts");
const aiFeaturesPath = resolve(repoDir, "docs/product/ai-features.mdx");

function generateMatrix(): string {
  const v2 = [...ACTION_TOOL_MANIFESTS_V2].sort((a, b) =>
    `${a.type}:${a.version}`.localeCompare(`${b.type}:${b.version}`),
  );
  if (v2.length === 0) {
    throw new Error("No Automation Manifest V2 entries found; refusing vacuous check.");
  }
  // V1 set parsed from the TOOL_V1 table (lines like `  move_stage: tool("move_stage", ...)`).
  // Anchored to the TOOL_V1 block so unrelated `tool(` calls never leak in.
  const registrySource = readFileSync(registryPath, "utf8");
  const toolV1Block = registrySource.match(
    /const TOOL_V1[^=]*=\s*\{([\s\S]*?)\n\};/,
  )?.[1];
  if (!toolV1Block) {
    throw new Error(
      `Could not locate the TOOL_V1 table in ${registryPath}; update the parser, do not delete the check.`,
    );
  }
  const v1 = [...toolV1Block.matchAll(/^\s{2}([a-z][a-z0-9_]*): tool\("([^"]+)"/gm)]
    .map((match) => ({ key: match[1]!, type: match[2]! as string, version: 1 }))
    .filter((entry) => entry.key === entry.type)
    .sort((a, b) =>
      `${a.type}:${a.version}`.localeCompare(`${b.type}:${b.version}`),
    );
  if (v1.length === 0) {
    throw new Error(
      `Parsed zero V1 entries from TOOL_V1 in ${registryPath}; the parser drifted, fix it instead of shipping an empty check.`,
    );
  }
  const v2Keys = new Set(v2.map((manifest) => `${manifest.type}:${manifest.version}`));
  const v1Keys = new Set(v1.map((manifest) => `${manifest.type}:${manifest.version}`));
  const duplicateV2 = v2.filter(
    (manifest, index) =>
      v2.findIndex(
        (candidate) =>
          candidate.type === manifest.type && candidate.version === manifest.version,
      ) !== index,
  );
  if (duplicateV2.length > 0) {
    throw new Error("Duplicate Automation Manifest V2 type/version detected.");
  }
  const missingLegacy = v2.filter(
    (manifest) => !v1Keys.has(`${manifest.type}:${manifest.version}`),
  );
  if (missingLegacy.length > 0) {
    throw new Error(
      `Manifest parity failed; missing V1 entries: ${missingLegacy
        .map((manifest) => `${manifest.type}:${manifest.version}`)
        .join(", ")}`,
    );
  }
  const orphanV1 = v1.filter(
    (manifest) => !v2Keys.has(`${manifest.type}:${manifest.version}`),
  );
  if (orphanV1.length > 0) {
    throw new Error(
      `Manifest parity failed; orphan V1 entries: ${orphanV1
        .map((manifest) => `${manifest.type}:${manifest.version}`)
        .join(", ")}`,
    );
  }

  // Every V2 manifest must carry a real contract, not just names: inputs with
  // types, outputs with paths, simulation evidence, and at least one example.
  // This is what lets Harly describe inputs/outputs without inventing them.
  const thinManifests = v2.filter(
    (manifest) =>
      manifest.inputs.length === 0 ||
      manifest.outputs.length === 0 ||
      manifest.simulation.scenarios.length === 0 ||
      manifest.examples.length === 0 ||
      manifest.inputs.some((field) => !field.type) ||
      manifest.outputs.some((field) => !field.path || !field.type),
  );
  if (thinManifests.length > 0) {
    throw new Error(
      `Manifest contracts incomplete (need inputs/outputs/simulation/examples): ${thinManifests
        .map((manifest) => `${manifest.type}@${manifest.version}`)
        .join(", ")}`,
    );
  }

  // The automation tool surface (model-facing tools + routing group) must
  // mention the durable/subgraph operations; otherwise a manifest claims a
  // capability the agent can never invoke.
  const requiredAgentTools = [
    "listAutomationTools",
    "getAutomationContext",
    "getAutomationSubgraph",
    "resolveAutomationResources",
    "prepareAutomationPlan",
    "prepareAutomationPatch",
    "rebaseAutomationPatch",
    "simulateAutomationProposal",
    "queueAutomationSimulation",
    "getAutomationJob",
    "diagnoseWorkflowRun",
    "prepareAutomationRepair",
    "applyAutomationProposal",
  ];
  const toolsSource = readFileSync(toolsPath, "utf8");
  const routingSource = readFileSync(routingPath, "utf8");
  const missingAgentTools = requiredAgentTools.filter(
    (name) => !toolsSource.includes(name) || !routingSource.includes(`"${name}"`),
  );
  if (missingAgentTools.length > 0) {
    throw new Error(
      `Automation agent surface incomplete (tools.ts + tool-routing.ts must list): ${missingAgentTools.join(", ")}`,
    );
  }

  // The generated matrix must stay linked from the user-facing docs, or it
  // rots unread.
  const aiFeatures = readFileSync(aiFeaturesPath, "utf8");
  if (!aiFeatures.includes("automation-capability-matrix.generated")) {
    throw new Error(
      `ai-features.mdx no longer links the generated capability matrix; restore the link instead of orphaning the artifact.`,
    );
  }

  const rows = v2
    .map(
      (manifest) =>
        `| \`${manifest.type}@${manifest.version}\` | ${manifest.label} | ${manifest.effect} | ${manifest.requiredPermissions.join(", ") || "—"} | ${manifest.integrationRequirements.join(", ") || "—"} | ${manifest.simulation.mode} | ${manifest.simulation.scenarios.join(", ")} |`,
    )
    .join("\n");
  return `<!-- This file is generated by apps/web/scripts/check-automation-capabilities.ts. Do not edit manually. -->
---
title: "Automation capability matrix"
description: "Generated parity matrix for Harly AI automation tools."
---

This matrix is generated from the runtime Automation Manifest V2 and checked
against the legacy manifest in CI. It is intentionally boring: if a tool is
not present here, Harly AI must not claim it can build or run that capability.

| Tool | Label | Effect | Permissions | Integrations | Simulation | Scenarios |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

## Contract checks

- V1 and V2 contain the same type/version set.
- Every row has explicit permissions, integration requirements, and simulation evidence.
- Every V2 manifest carries typed inputs, output paths, simulation scenarios, and examples.
- The automation agent surface (tools + routing) exposes the durable/subgraph operations.
- This matrix stays linked from ai-features.mdx.
- Generated output must match the checked-in artifact in CI.
`;
}

const generated = generateMatrix();
const checkOnly = process.argv.includes("--check");
if (checkOnly) {
  if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== generated) {
    throw new Error(
      "Automation capability matrix is stale. Run pnpm --filter web generate:automation-capabilities.",
    );
  }
} else {
  writeFileSync(outputPath, generated, "utf8");
}

console.log(`Automation capability matrix ${checkOnly ? "verified" : "generated"}.`);
