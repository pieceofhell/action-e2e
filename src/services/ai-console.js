const path = require("path");
const { normalizeAiConfig, requestTextResponse } = require("./llm-provider");

async function runAiConsoleTurn({
  aiConfig,
  conversation,
  projectPath,
  inspection,
  plan,
  execution,
  insights,
}) {
  const normalized = normalizeAiConfig(aiConfig);
  const sanitizedConversation = sanitizeConversation(conversation);

  if (!sanitizedConversation.length) {
    throw new Error("Send a message to the model console.");
  }

  const context = buildConsoleContext({
    projectPath,
    inspection,
    plan,
    execution,
    insights,
  });

  if (!normalized.enabled) {
    return {
      reply: buildHeuristicConsoleReply(context),
      metadata: buildConsoleMetadata(normalized, "heuristic-console", false),
    };
  }

  const systemPrompt = [
    "You are the internal conversational assistant for a local E2E test-generation prototype.",
    "Respond in clear English, with practical and concise guidance.",
    "Use only the provided context about the project and the current pipeline state.",
    "Do not invent pages, files, execution results, or capabilities that are not present in the context.",
    "If the context is incomplete, explicitly say what is missing.",
    "When the user asks for practical guidance, prefer short and verifiable steps.",
    "Current pipeline context:",
    JSON.stringify(context, null, 2),
  ].join("\n");

  const reply = await requestTextResponse({
    aiConfig: normalized,
    systemPrompt,
    messages: sanitizedConversation,
  });

  return {
    reply: sanitizeText(reply),
    metadata: buildConsoleMetadata(normalized, "interactive-console", true),
  };
}

function buildConsoleContext({ projectPath, inspection, plan, execution, insights }) {
  const detectedProjectPath = inspection?.project?.path || projectPath || "";
  const detectedName = inspection?.project?.name || (detectedProjectPath ? path.basename(detectedProjectPath) : "No project loaded");

  return {
    project: {
      name: detectedName,
      path: detectedProjectPath,
    },
    inspection: inspection
      ? {
          synopsis: inspection.projectSynopsis,
          framework: inspection.detection?.framework || "",
          primaryLanguage: inspection.detection?.primaryLanguage || "",
          appType: inspection.detection?.appType || "",
          confidence: inspection.detection?.confidence || "",
          runtime: inspection.runtime
            ? {
                mode: inspection.runtime.mode,
                installCommand: inspection.runtime.installCommand || "",
                startCommand: inspection.runtime.startCommand || "",
                baseUrl: inspection.runtime.baseUrl || "",
                notes: inspection.runtime.notes || "",
              }
            : null,
          mainCapabilities: (inspection.ai?.mainCapabilities || []).slice(0, 6),
          relevantFiles: (inspection.relevantFiles || []).slice(0, 6).map((file) => file.relativePath),
          signals: (inspection.signals || []).slice(0, 6),
          warnings: (inspection.warnings || []).slice(0, 6),
        }
      : null,
    plan: plan
      ? {
          mode: plan.mode,
          summary: plan.summary,
          flows: (plan.flows || []).slice(0, 6).map((flow) => ({
            id: flow.id,
            title: flow.title,
            confidence: flow.confidence,
            approved: Boolean(flow.approved),
            summary: flow.summary,
          })),
        }
      : null,
    execution: execution
      ? {
          runtime: execution.runtime
            ? {
                mode: execution.runtime.mode,
                baseUrl: execution.runtime.baseUrl,
              }
            : null,
          report: execution.report
            ? {
                summary: execution.report.summary || {},
                tests: (execution.report.tests || []).slice(0, 6).map((test) => ({
                  title: test.title,
                  status: test.status,
                  error: sanitizeText(test.error).slice(0, 400),
                })),
              }
            : null,
        }
      : null,
    insights: insights
      ? {
          overview: insights.overview,
          insights: (insights.insights || []).slice(0, 6),
          limitations: (insights.limitations || []).slice(0, 6),
          nextSteps: (insights.nextSteps || []).slice(0, 6),
        }
      : null,
  };
}

function sanitizeConversation(conversation) {
  if (!Array.isArray(conversation)) {
    return [];
  }

  return conversation
    .map((message) => ({
      role: normalizeRole(message?.role),
      content: sanitizeText(message?.content).slice(0, 4000),
    }))
    .filter((message) => message.content)
    .slice(-12);
}

function normalizeRole(role) {
  if (role === "assistant") {
    return "assistant";
  }

  return "user";
}

function buildHeuristicConsoleReply(context) {
  const parts = [
    "The console is currently running in local-heuristics mode, so there is no generative model active for open-ended conversation.",
    "Select a provider such as Local Ollama or an OpenAI-compatible endpoint to talk directly to the model responsible for semantic refinement.",
  ];

  if (context.project?.name) {
    parts.push(`Current project: ${context.project.name}.`);
  }

  if (context.inspection?.synopsis) {
    parts.push(`Current summary: ${context.inspection.synopsis}`);
  }

  if (context.plan?.flows?.length) {
    parts.push(`Current proposed flows: ${context.plan.flows.map((flow) => flow.title).join(", ")}.`);
  }

  if (context.execution?.report?.summary) {
    const summary = context.execution.report.summary;
    parts.push(`Latest observed run: ${summary.total || 0} test(s), ${summary.passed || 0} passed, ${summary.failed || 0} failed.`);
  }

  return parts.join("\n\n");
}

function buildConsoleMetadata(normalized, stage, usedModel) {
  return {
    provider: normalized.provider,
    model: normalized.model || "",
    endpoint: normalized.endpoint || "",
    label: normalized.label,
    stage,
    usedModel,
  };
}

function sanitizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

module.exports = {
  runAiConsoleTurn,
};
