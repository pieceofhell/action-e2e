const fs = require("node:fs/promises");
const path = require("node:path");
const { requestStructuredJson } = require("../src/services/llm-provider");

const prototypeRoot = path.resolve(__dirname, "..");
const discoveryFile = process.env.E2P_DISCOVERY_RESULT || path.join(
  prototypeRoot,
  "evaluation-results",
  "bug-discovery",
  "dopa-favorites-blind-vision-only-navigation-consistency-gemma3-12b.json",
);
const criticModel = process.env.E2P_CRITIC_MODEL || "qwen2.5vl:7b";

async function main() {
  const discovery = JSON.parse(await fs.readFile(discoveryFile, "utf8"));
  const evidencePaths = discovery.revisions?.buggy?.visualEvidence || [];
  const images = await Promise.all(evidencePaths.map((relativePath) => (
    fs.readFile(path.join(prototypeRoot, relativePath), "base64")
  )));
  const response = await requestStructuredJson({
    aiConfig: {
      provider: "ollama",
      endpoint: process.env.E2P_POC_OLLAMA_ENDPOINT || "http://127.0.0.1:11434",
      model: criticModel,
    },
    timeoutMs: 180000,
    systemPrompt: [
      "You are an independent critic in a blind web QA campaign.",
      "You receive the same screenshot tiles, the prior browser action, and hypotheses authored by another model.",
      "You do not receive an issue, source code, commit message, fixed revision, or hidden ground truth.",
      "Separate the supported core claim from incorrect or unsupported secondary claims.",
      "A highlighted navigation item normally indicates the current active view; do not call that convention a defect by itself.",
      "Accept a hypothesis only when visible evidence supports a concrete inconsistency and a falsifiable browser oracle.",
      "Return raw JSON only: {\"reviews\":[{\"title\":\"...\",\"decision\":\"accept|accept-with-correction|reject\",\"supportedCoreClaim\":\"...\",\"unsupportedClaims\":[\"...\"],\"correctedExpectedBehavior\":\"...\",\"executableOracle\":\"...\"}]}",
    ].join(" "),
    userPrompt: JSON.stringify({
      previousAction: discovery.revisions?.buggy?.action,
      hypotheses: discovery.blindModelAssessment?.hypotheses || [],
    }),
    images,
  });
  const outputPath = discoveryFile.replace(/\.json$/i, `-critic-${safeName(criticModel)}.json`);
  const result = {
    protocol: "independent-blind-critic-v1",
    discoveryModel: discovery.model,
    criticModel,
    disclosureToCritic: {
      issue: false,
      source: false,
      fixedRevision: false,
      groundTruth: false,
    },
    reviews: Array.isArray(response?.reviews) ? response.reviews : [],
  };
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ outputPath, reviews: result.reviews }, null, 2)}\n`);
}

function safeName(value) {
  return String(value || "model").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
