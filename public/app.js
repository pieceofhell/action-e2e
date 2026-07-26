const DEFAULT_AI_CONFIG = {
  provider: "heuristic",
  endpoint: "",
  model: "",
  apiKey: "",
};

const state = {
  projectPath: "",
  inspection: null,
  plan: null,
  generated: null,
  execution: null,
  insights: null,
  chatMessages: [],
  chatPending: false,
  messageCounter: 0,
  aiCatalog: null,
  aiConfig: { ...DEFAULT_AI_CONFIG },
  aiTouched: false,
};

const elements = {
  healthBadge: document.getElementById("healthBadge"),
  projectPathInput: document.getElementById("projectPathInput"),
  browseProjectButton: document.getElementById("browseProjectButton"),
  loadProjectButton: document.getElementById("loadProjectButton"),
  exploreLiveButton: document.getElementById("exploreLiveButton"),
  generatePlanButton: document.getElementById("generatePlanButton"),
  generateTestsButton: document.getElementById("generateTestsButton"),
  runTestsButton: document.getElementById("runTestsButton"),
  inspectionSummary: document.getElementById("inspectionSummary"),
  flowList: document.getElementById("flowList"),
  generatedArtifacts: document.getElementById("generatedArtifacts"),
  resultsPanel: document.getElementById("resultsPanel"),
  runtimeModeInput: document.getElementById("runtimeModeInput"),
  installCommandInput: document.getElementById("installCommandInput"),
  startCommandInput: document.getElementById("startCommandInput"),
  baseUrlInput: document.getElementById("baseUrlInput"),
  workingDirectoryInput: document.getElementById("workingDirectoryInput"),
  runInstallCheckbox: document.getElementById("runInstallCheckbox"),
  selectionStatus: document.getElementById("selectionStatus"),
  inspectionStatus: document.getElementById("inspectionStatus"),
  criteriaStatus: document.getElementById("criteriaStatus"),
  generationStatus: document.getElementById("generationStatus"),
  artifactsStatus: document.getElementById("artifactsStatus"),
  executionStatus: document.getElementById("executionStatus"),
  aiStatus: document.getElementById("aiStatus"),
  aiProviderInput: document.getElementById("aiProviderInput"),
  aiModelSelect: document.getElementById("aiModelSelect"),
  aiModelInput: document.getElementById("aiModelInput"),
  aiEndpointInput: document.getElementById("aiEndpointInput"),
  aiApiKeyInput: document.getElementById("aiApiKeyInput"),
  refreshAiButton: document.getElementById("refreshAiButton"),
  aiProviderNote: document.getElementById("aiProviderNote"),
  aiUsagePanel: document.getElementById("aiUsagePanel"),
  chatTranscript: document.getElementById("chatTranscript"),
  chatInput: document.getElementById("chatInput"),
  sendChatButton: document.getElementById("sendChatButton"),
  clearChatButton: document.getElementById("clearChatButton"),
  consoleStatus: document.getElementById("consoleStatus"),
  timelineList: document.getElementById("timelineList"),
  toast: document.getElementById("toast"),
};

bootstrap();

async function bootstrap() {
  wireEvents();
  renderAiUsage();
  renderAll();
  await Promise.all([refreshHealth(), refreshAiProviders()]);
  renderAll();
}

function wireEvents() {
  elements.projectPathInput.addEventListener("input", handleProjectPathInput);
  elements.browseProjectButton.addEventListener("click", handleBrowseProject);
  elements.loadProjectButton.addEventListener("click", handleLoadProject);
  elements.exploreLiveButton.addEventListener("click", handleExploreLiveProject);
  elements.generatePlanButton.addEventListener("click", handleGeneratePlan);
  elements.generateTestsButton.addEventListener("click", handleGenerateTests);
  elements.runTestsButton.addEventListener("click", handleRunTests);
  elements.runtimeModeInput.addEventListener("change", renderRuntimeModeState);
  elements.aiProviderInput.addEventListener("change", handleAiProviderChange);
  elements.aiModelSelect.addEventListener("change", handleAiModelSelectChange);
  elements.aiModelInput.addEventListener("input", handleAiInputChange);
  elements.aiEndpointInput.addEventListener("input", handleAiInputChange);
  elements.aiApiKeyInput.addEventListener("input", handleAiInputChange);
  elements.refreshAiButton.addEventListener("click", handleRefreshAiProviders);
  elements.sendChatButton.addEventListener("click", handleSendChat);
  elements.clearChatButton.addEventListener("click", handleClearChat);
  elements.chatInput.addEventListener("keydown", handleChatKeydown);
}

async function refreshHealth() {
  try {
    const payload = await apiGet("/api/health");
    elements.healthBadge.textContent = payload.ok ? "Server online" : "Server unavailable";
  } catch (error) {
    elements.healthBadge.textContent = "Connection failed";
  }
}

async function refreshAiProviders() {
  try {
    const payload = await apiGet("/api/ai/status");
    state.aiCatalog = payload;
    ensureAiDefaults();
  } catch (error) {
    state.aiCatalog = buildFallbackAiCatalog(error.message);
    ensureAiDefaults(true);
  }

  renderAiConfiguration();
}

function handleProjectPathInput(event) {
  state.projectPath = event.target.value.trim();
  updateTimeline();
}

async function handleBrowseProject() {
  try {
    setStatus("selectionStatus", "Opening picker...", "is-warning");
    const payload = await apiPost("/api/project/select");

    if (payload.selectedPath) {
      state.projectPath = payload.selectedPath;
      elements.projectPathInput.value = payload.selectedPath;
      setStatus("selectionStatus", "Directory selected", "is-ready");
      notify("Folder selected. Loading the project automatically.");
      await loadProjectFromPath(payload.selectedPath);
      return;
    }

    setStatus("selectionStatus", "Selection canceled", "");
  } catch (error) {
    setStatus("selectionStatus", "Failed", "is-error");
    notify(error.message);
  }
}

async function handleLoadProject() {
  const projectPath = elements.projectPathInput.value.trim();

  if (!projectPath) {
    notify("Enter or select the project path.");
    return;
  }

  await loadProjectFromPath(projectPath);
}

async function loadProjectFromPath(projectPath) {
  if (!projectPath) {
    notify("Enter or select the project path.");
    return;
  }

  try {
    setStatus("selectionStatus", "Loading...", "is-warning");
    const payload = await apiPost("/api/project/load", {
      projectPath,
      aiConfig: collectAiConfig(),
    });

    state.projectPath = projectPath;
    state.inspection = payload.inspection;
    state.plan = null;
    state.generated = null;
    state.execution = null;
    state.insights = null;
    resetChatConsole();

    populateRuntimeFields(payload.inspection.runtime);
    setStatus("selectionStatus", "Project loaded", "is-ready");
    setStatus("inspectionStatus", "Inspection complete", "is-ready");
    setStatus("criteriaStatus", "Pending", "");
    setStatus("generationStatus", "Pending", "");
    setStatus("artifactsStatus", "Pending", "");
    setStatus("executionStatus", "Pending", "");
    elements.exploreLiveButton.disabled = false;
    elements.generatePlanButton.disabled = false;
    elements.generateTestsButton.disabled = true;
    elements.runTestsButton.disabled = true;

    renderAll();

    if (state.inspection.ai?.error) {
      notify("The model did not respond during inspection. The heuristic reading was preserved.");
      return;
    }

    notify("Project inspected successfully.");
  } catch (error) {
    setStatus("inspectionStatus", "Failed", "is-error");
    notify(error.message);
  }
}

async function handleExploreLiveProject() {
  if (!state.inspection) {
    notify("Load a project before exploring the live interface.");
    return;
  }

  try {
    setStatus("inspectionStatus", "Exploring live app...", "is-warning");
    elements.exploreLiveButton.disabled = true;

    const payload = await apiPost("/api/project/explore-live", {
      projectPath: state.projectPath,
      inspection: state.inspection,
      runtimeConfig: collectRuntimeConfig(),
      aiConfig: collectAiConfig(),
    });

    state.inspection = payload.inspection;
    state.plan = null;
    state.generated = null;
    state.execution = null;
    state.insights = null;

    setStatus("inspectionStatus", "Inspection updated", "is-ready");
    setStatus("criteriaStatus", "Pending", "");
    setStatus("generationStatus", "Pending", "");
    setStatus("artifactsStatus", "Pending", "");
    setStatus("executionStatus", "Pending", "");
    elements.generatePlanButton.disabled = false;
    elements.generateTestsButton.disabled = true;
    elements.runTestsButton.disabled = true;

    renderAll();

    const liveExploration = payload.liveExploration || state.inspection.liveExploration;

    if (liveExploration?.status === "completed") {
      notify("Live interface exploration completed. The model can now ground flows and criteria in the rendered UI.");
      return;
    }

    if (liveExploration?.status === "unsupported") {
      notify("Live exploration could not run with the current runtime mode. Adjust the runtime settings and try again.");
      return;
    }

    if (liveExploration?.status === "failed") {
      notify(liveExploration.error || "Live exploration failed.");
      return;
    }

    notify("Inspection updated.");
  } catch (error) {
    setStatus("inspectionStatus", "Failed", "is-error");
    notify(error.message);
  } finally {
    elements.exploreLiveButton.disabled = !state.inspection;
  }
}

async function handleGeneratePlan() {
  if (!state.inspection) {
    notify("Load a project before generating flows.");
    return;
  }

  try {
    setStatus("criteriaStatus", "Generating...", "is-warning");
    const payload = await apiPost("/api/pipeline/plan", {
      inspection: state.inspection,
      aiConfig: collectAiConfig(),
    });

    state.plan = payload.plan;
    state.plan.flows = state.plan.flows.map((flow) => ({
      ...flow,
      approved: flow.confidence !== "low",
      criteriaText: formatCriteria(flow.criteria),
    }));
    state.generated = null;
    state.execution = null;
    state.insights = null;

    setStatus("criteriaStatus", "Criteria ready for review", "is-ready");
    elements.generateTestsButton.disabled = false;
    elements.runTestsButton.disabled = true;
    renderAll();

    if (state.plan.ai?.error) {
      notify("The configured provider failed during semantic curation. The heuristic plan was kept.");
      return;
    }

    notify("Flows generated. Review and approve the criteria before continuing.");
  } catch (error) {
    setStatus("criteriaStatus", "Failed", "is-error");
    notify(error.message);
  }
}

async function handleGenerateTests() {
  const approvedFlows = collectApprovedFlows();

  if (!approvedFlows.length) {
    notify("Approve at least one flow before generating tests.");
    return;
  }

  try {
    setStatus("generationStatus", "Generating...", "is-warning");
    const payload = await apiPost("/api/tests/generate", {
      projectPath: state.projectPath,
      inspection: state.inspection,
      approvedFlows,
      runtimeConfig: collectRuntimeConfig(),
      aiConfig: collectAiConfig(),
    });

    state.generated = payload.generated;
    state.execution = null;
    state.insights = null;

    setStatus("generationStatus", "Tests generated", "is-ready");
    setStatus("artifactsStatus", "Artifacts available", "is-ready");
    elements.runTestsButton.disabled = false;
    renderAll();
    notify("Playwright artifacts generated successfully.");
  } catch (error) {
    setStatus("generationStatus", "Failed", "is-error");
    notify(error.message);
  }
}

async function handleRunTests() {
  const approvedFlows = collectApprovedFlows();

  if (!state.generated) {
    notify("Generate the tests before running the pipeline.");
    return;
  }

  try {
    setStatus("executionStatus", "Running...", "is-warning");
    const payload = await apiPost("/api/tests/run", {
      projectPath: state.projectPath,
      inspection: state.inspection,
      approvedFlows,
      generated: state.generated,
      aiConfig: collectAiConfig(),
    });

    state.execution = payload.execution;
    state.insights = payload.insights;

    setStatus("executionStatus", "Evidence ready", "is-ready");
    renderAll();

    if (state.insights.ai?.error) {
      notify("The results were consolidated, but the model failed during the final insight enrichment step.");
      return;
    }

    notify("Execution finished. Review the visual evidence, results, and insights.");
  } catch (error) {
    setStatus("executionStatus", "Failed", "is-error");
    notify(error.message);
  }
}

async function handleRefreshAiProviders() {
  elements.refreshAiButton.disabled = true;
  try {
    await refreshAiProviders();
    notify("Provider catalog refreshed.");
  } catch (error) {
    notify(error.message);
  } finally {
    elements.refreshAiButton.disabled = false;
  }
}

function handleChatKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleSendChat();
  }
}

async function handleSendChat() {
  const message = elements.chatInput.value.trim();

  if (!message) {
    notify("Write a message to send to the model.");
    return;
  }

  appendChatMessage({
    role: "user",
    content: message,
    label: "You",
  });

  elements.chatInput.value = "";
  state.chatPending = true;
  setStatus("consoleStatus", "Querying...", "is-warning");
  renderChatConsole();

  try {
    const payload = await apiPost("/api/ai/chat", {
      aiConfig: collectAiConfig(),
      conversation: state.chatMessages.map((item) => ({
        role: item.role,
        content: item.content,
      })),
      projectPath: state.projectPath,
      inspection: state.inspection,
      plan: state.plan,
      execution: state.execution,
      insights: state.insights,
    });

    appendChatMessage({
      role: "assistant",
      content: payload.reply,
      label: payload.metadata?.label || "Assistant",
    });

    setStatus("consoleStatus", payload.metadata?.usedModel ? "Reply ready" : "Local reply", payload.metadata?.usedModel ? "is-ready" : "");
  } catch (error) {
    appendChatMessage({
      role: "assistant",
      content: `Failed to query the model console: ${error.message}`,
      label: "System",
    });
    setStatus("consoleStatus", "Failed", "is-error");
    notify(error.message);
  } finally {
    state.chatPending = false;
    renderChatConsole();
  }
}

function handleClearChat() {
  resetChatConsole();
  renderChatConsole();
  notify("Conversation cleared.");
}

function handleAiProviderChange(event) {
  state.aiTouched = true;
  const providerId = event.target.value;
  const provider = (state.aiCatalog?.providers || []).find((candidate) => candidate.id === providerId);

  if (providerId === "heuristic") {
    state.aiConfig = { ...DEFAULT_AI_CONFIG };
  } else {
    state.aiConfig = {
      provider: providerId,
      endpoint: provider?.endpoint || "",
      model: getPreferredModel(provider?.models || []),
      apiKey: "",
    };
  }

  renderAiConfiguration();
}

function handleAiModelSelectChange(event) {
  state.aiTouched = true;
  if (event.target.value) {
    state.aiConfig.model = event.target.value;
    elements.aiModelInput.value = event.target.value;
  }

  syncAiStatusChip();
}

function handleAiInputChange() {
  state.aiTouched = true;
  state.aiConfig = collectAiConfig();
  syncAiStatusChip();
}

function renderAll() {
  renderAiConfiguration();
  renderChatConsole();
  renderInspection();
  renderFlows();
  renderArtifacts();
  renderResults();
  renderRuntimeModeState();
  updateTimeline();
}

function renderAiConfiguration() {
  const providers = state.aiCatalog?.providers || buildFallbackAiCatalog().providers;
  const currentProviderId = state.aiConfig.provider || "heuristic";
  const providerExists = providers.some((provider) => provider.id === currentProviderId);

  if (!providerExists) {
    ensureAiDefaults(true);
  }

  elements.aiProviderInput.innerHTML = providers
    .map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(buildProviderLabel(provider))}</option>`)
    .join("");
  elements.aiProviderInput.value = state.aiConfig.provider;

  const provider = getCurrentAiProvider();
  const models = provider?.models || [];
  const selectedModel = state.aiConfig.model || "";

  elements.aiModelSelect.innerHTML = buildModelOptions(models, selectedModel, state.aiConfig.provider);
  elements.aiModelSelect.value = selectedModel;
  if (!elements.aiModelSelect.value) {
    elements.aiModelSelect.value = "";
  }
  elements.aiModelInput.value = state.aiConfig.model;
  elements.aiEndpointInput.value = state.aiConfig.endpoint;
  elements.aiApiKeyInput.value = state.aiConfig.apiKey;

  const disableModelFields = state.aiConfig.provider === "heuristic";
  elements.aiModelSelect.disabled = disableModelFields;
  elements.aiModelInput.disabled = disableModelFields;
  elements.aiEndpointInput.disabled = disableModelFields;
  elements.aiApiKeyInput.disabled = disableModelFields || !(provider?.requiresApiKey || state.aiConfig.provider === "openai-compatible");

  renderAiProviderNote(provider);
  renderAiUsage();
  syncAiStatusChip();
}

function renderInspection() {
  if (!state.inspection) {
    elements.inspectionSummary.innerHTML = "The project analysis has not been run yet.";
    elements.inspectionSummary.className = "summary-grid empty-state";
    return;
  }

  const { inspection } = state;
  const aiLabel = inspection.ai?.label || "Local heuristics";
  const aiStage = inspection.ai?.stage || "heuristic-only";
  const aiMainCapabilities = inspection.ai?.mainCapabilities || [];
  const aiReasoning = inspection.ai?.reasoning || [];

  elements.inspectionSummary.className = "summary-grid";
  elements.inspectionSummary.innerHTML = `
    <article class="summary-card">
      <div class="metric">
        <span>Project</span>
        <strong>${escapeHtml(inspection.project.name)}</strong>
      </div>
      <p>${escapeHtml(inspection.projectSynopsis)}</p>
    </article>
    <article class="summary-card">
      <div class="metric">
        <span>Framework</span>
        <strong>${escapeHtml(inspection.detection.framework)}</strong>
      </div>
      <p>Primary language: ${escapeHtml(inspection.detection.primaryLanguage)}</p>
      <p>Archetype: ${escapeHtml(inspection.detection.appType)}</p>
      <p>Confidence: ${escapeHtml(inspection.detection.confidence)}</p>
    </article>
    <article class="summary-card">
      <div class="metric">
        <span>Suggested execution</span>
        <strong>${escapeHtml(inspection.runtime.mode)}</strong>
      </div>
      <p>${escapeHtml(inspection.runtime.notes || "No additional notes.")}</p>
      <p>Working directory: <code>${escapeHtml(inspection.runtime.workingDirectory || ".")}</code></p>
      <p>Start command: <code>${escapeHtml(inspection.runtime.startCommand || "not detected")}</code></p>
      <p>Base URL: <code>${escapeHtml(inspection.runtime.baseUrl || "not detected")}</code></p>
    </article>
    <article class="summary-card">
      <div class="metric">
        <span>Files</span>
        <strong>${inspection.stats.totalFiles}</strong>
      </div>
      <p>HTML/JSX/TSX files read: ${inspection.stats.htmlLikeFiles}</p>
      <p>README: ${inspection.manifests.readme ? escapeHtml(inspection.manifests.readme.path) : "not found"}</p>
    </article>
    <article class="summary-card">
      <div class="metric">
        <span>Semantic layer</span>
        <strong>${escapeHtml(aiLabel)}</strong>
      </div>
      <p>Recorded stage: ${escapeHtml(aiStage)}</p>
      <p>${escapeHtml(inspection.ai?.userPersona || "No additional user persona was inferred at this stage.")}</p>
      ${inspection.ai?.error ? `<p>Recorded failure: ${escapeHtml(inspection.ai.error)}</p>` : ""}
    </article>
    <article class="summary-card summary-card--wide">
      <strong>Inferred capabilities and reasoning</strong>
      ${renderList(aiMainCapabilities, "The model did not add extra capabilities at this stage.")}
      ${renderList(aiReasoning, "No additional reasoning trail is available to display.")}
    </article>
    <article class="summary-card">
      <strong>Relevant signals</strong>
      ${renderList(inspection.signals, "No relevant signals were recorded.")}
    </article>
    <article class="summary-card">
      <strong>Key files</strong>
      ${
        inspection.relevantFiles.length
          ? `<ul class="list">${inspection.relevantFiles.map((file) => `<li><code>${escapeHtml(file.relativePath)}</code></li>`).join("")}</ul>`
          : "<p>No key files were highlighted.</p>"
      }
    </article>
    <article class="summary-card">
      <strong>UI hints</strong>
      <p>Buttons: ${inspection.uiHints.buttons.length}</p>
      <p>Links: ${inspection.uiHints.links.length}</p>
      <p>Inputs: ${inspection.uiHints.inputs.length}</p>
      <p>Canvas: ${inspection.uiHints.canvases.length}</p>
    </article>
    <article class="summary-card">
      <strong>Warnings</strong>
      ${
        inspection.warnings.length
          ? `<ul class="list">${inspection.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
          : "<p>No critical warnings were generated at this stage.</p>"
      }
    </article>
    ${renderLiveExplorationCard(inspection.liveExploration)}
  `;
}

function renderLiveExplorationCard(liveExploration) {
  if (!liveExploration) {
    return `
      <article class="summary-card summary-card--wide">
        <strong>Live interface exploration</strong>
        <p>The rendered interface has not been explored yet. Run the live exploration step to let the model inspect the app after startup.</p>
      </article>
    `;
  }

  const summary = liveExploration.summary || {};
  const routeItems = (liveExploration.routes || []).slice(0, 4).map((route) => {
    const heading = route.headings?.[0] || "No strong heading captured";
    return `${route.path || route.url || "/"} - ${heading}`;
  });

  return `
    <article class="summary-card summary-card--wide">
      <strong>Live interface exploration</strong>
      <p>Status: ${escapeHtml(liveExploration.status || "unknown")}</p>
      <p>Mode used: ${escapeHtml(liveExploration.mode || "n/a")}</p>
      <p>Base URL: <code>${escapeHtml(liveExploration.baseUrl || "n/a")}</code></p>
      <p>Observed routes: ${summary.routeCount ?? 0}</p>
      <p>Unique visible actions: ${(summary.uniqueButtons || []).length}</p>
      <p>Unique visible inputs: ${(summary.uniqueInputs || []).length}</p>
      ${renderList(routeItems, "No route-level observations were captured.")}
      ${
        liveExploration.error
          ? `<p>Recorded live-exploration failure: ${escapeHtml(liveExploration.error)}</p>`
          : ""
      }
    </article>
  `;
}

function renderFlows() {
  if (!state.plan) {
    elements.flowList.innerHTML = "Flows will be proposed after the project is inspected.";
    elements.flowList.className = "stack empty-state";
    return;
  }

  elements.flowList.className = "stack";
  elements.flowList.innerHTML = `
    <article class="summary-card">
      <strong>Generation mode</strong>
      <p>${escapeHtml(describePlanMode(state.plan))}</p>
    </article>
    <article class="summary-card">
      <strong>Model participation</strong>
      <p>${escapeHtml(describePlanAi(state.plan.ai))}</p>
    </article>
    ${state.plan.flows.map(renderFlowCard).join("")}
  `;

  bindFlowEvents();
}

function renderFlowCard(flow, index) {
  return `
    <article class="flow-card" data-flow-id="${escapeHtml(flow.id)}">
      <div class="flow-card__header">
        <div>
          <div class="flow-card__topline">
            <label class="checkbox">
              <input type="checkbox" data-flow-approve="${escapeHtml(flow.id)}" ${flow.approved ? "checked" : ""} />
              <span>Approve flow</span>
            </label>
            <span class="confidence confidence--${escapeHtml(flow.confidence)}">${escapeHtml(flow.confidence)}</span>
          </div>
          <h3>${index + 1}. ${escapeHtml(flow.title)}</h3>
          <p>${escapeHtml(flow.summary)}</p>
        </div>
      </div>

      <div class="grid-two">
        <div>
          <strong>Source signals</strong>
          ${renderList(flow.sourceSignals, "No additional signals were recorded.")}
        </div>
        <div>
          <strong>Assumptions</strong>
          ${renderList(flow.assumptions, "No extra assumptions were recorded.")}
        </div>
      </div>

      <label class="field">
        <span>Editable acceptance criteria</span>
        <textarea data-flow-criteria="${escapeHtml(flow.id)}">${escapeHtml(flow.criteriaText)}</textarea>
      </label>
    </article>
  `;
}

function bindFlowEvents() {
  document.querySelectorAll("[data-flow-approve]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const flow = state.plan.flows.find((candidate) => candidate.id === event.target.dataset.flowApprove);
      if (flow) {
        flow.approved = event.target.checked;
      }
      updateTimeline();
    });
  });

  document.querySelectorAll("[data-flow-criteria]").forEach((textarea) => {
    textarea.addEventListener("input", (event) => {
      const flow = state.plan.flows.find((candidate) => candidate.id === event.target.dataset.flowCriteria);
      if (flow) {
        flow.criteriaText = event.target.value;
      }
    });
  });
}

function renderArtifacts() {
  if (!state.generated) {
    elements.generatedArtifacts.innerHTML = "Playwright files have not been generated yet.";
    elements.generatedArtifacts.className = "stack empty-state";
    return;
  }

  const aiLabel = state.plan?.ai?.label || state.inspection?.ai?.label || "Local heuristics";

  elements.generatedArtifacts.className = "stack";
  elements.generatedArtifacts.innerHTML = `
    <article class="artifact-card">
      <strong>Isolated execution</strong>
      <p><code>${escapeHtml(state.generated.runDirectory)}</code></p>
      <p>The tests were generated outside the analyzed project, in a dedicated prototype directory.</p>
      <p>Semantic layer used during preparation: ${escapeHtml(aiLabel)}</p>
      <div class="artifact-links">
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/generated-tests.json`)}" target="_blank" rel="noreferrer">generated-tests.json</a>
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/approved-flows.json`)}" target="_blank" rel="noreferrer">approved-flows.json</a>
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/runtime-config.json`)}" target="_blank" rel="noreferrer">runtime-config.json</a>
      </div>
    </article>
    ${state.generated.generatedTests.map((testFile) => `
      <article class="artifact-card">
        <strong>${escapeHtml(testFile.title)}</strong>
        <p><code>${escapeHtml(testFile.fileName)}</code></p>
        <p>Authoring mode: ${escapeHtml(testFile.generationMode || "heuristic")}</p>
        ${testFile.generationNote ? `<p>${escapeHtml(testFile.generationNote)}</p>` : ""}
      </article>
    `).join("")}
  `;
}

function renderResults() {
  if (!state.execution || !state.insights) {
    elements.resultsPanel.innerHTML = "Pipeline results will appear here after execution.";
    elements.resultsPanel.className = "stack empty-state";
    return;
  }

  const tests = state.execution.report.tests || [];
  const summary = state.execution.report.summary || {};
  const aiLabel = state.insights.ai?.label || state.plan?.ai?.label || state.inspection?.ai?.label || "Local heuristics";

  elements.resultsPanel.className = "stack";
  elements.resultsPanel.innerHTML = `
    <article class="result-card">
      <strong>Execution summary</strong>
      <div class="summary-grid">
        <div class="metric">
          <span>Total</span>
          <strong>${summary.total ?? 0}</strong>
        </div>
        <div class="metric">
          <span>Passed</span>
          <strong>${summary.passed ?? 0}</strong>
        </div>
        <div class="metric">
          <span>Failed</span>
          <strong>${summary.failed ?? 0}</strong>
        </div>
        <div class="metric">
          <span>Skipped</span>
          <strong>${summary.skipped ?? 0}</strong>
        </div>
      </div>
      <p>Base URL used: <code>${escapeHtml(state.execution.runtime.baseUrl)}</code></p>
      <p>Semantic consolidation: ${escapeHtml(aiLabel)}</p>
      <div class="artifact-links">
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/results/playwright-results.json`)}" target="_blank" rel="noreferrer">playwright-results.json</a>
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/results/stdout.log`)}" target="_blank" rel="noreferrer">stdout.log</a>
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/results/stderr.log`)}" target="_blank" rel="noreferrer">stderr.log</a>
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/results/visual-evidence.json`)}" target="_blank" rel="noreferrer">visual-evidence.json</a>
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/results/insights.json`)}" target="_blank" rel="noreferrer">insights.json</a>
      </div>
    </article>

    ${renderEvidenceGallery(tests)}

    <article class="result-card">
      <strong>Overview</strong>
      <p>${escapeHtml(state.insights.overview || "No additional overview is available.")}</p>
      ${state.insights.ai?.error ? `<p>Recorded failure during final enrichment: ${escapeHtml(state.insights.ai.error)}</p>` : ""}
    </article>

    <article class="result-card">
      <strong>Insights</strong>
      ${renderList(state.insights.insights, "No insights were consolidated.")}
    </article>

    <article class="result-card">
      <strong>Observed limitations</strong>
      ${renderList(state.insights.limitations, "No additional limitations were recorded.")}
    </article>

    <article class="result-card">
      <strong>Suggested next steps</strong>
      ${renderList(state.insights.nextSteps, "No additional suggestions were recorded.")}
    </article>

    ${tests.map((testItem) => `
      <article class="result-card">
        <div class="flow-card__topline">
          <strong>${escapeHtml(testItem.title)}</strong>
          <span class="confidence confidence--${testItem.status === "passed" ? "high" : testItem.status === "failed" ? "low" : "medium"}">${escapeHtml(testItem.status)}</span>
        </div>
        <p>File: <code>${escapeHtml(testItem.file || "n/a")}</code></p>
        ${testItem.error ? `<pre class="code-block">${escapeHtml(testItem.error)}</pre>` : ""}
      </article>
    `).join("")}
  `;
}

function renderEvidenceGallery(tests) {
  const items = (tests || []).flatMap((testItem) => (testItem.evidence || []).map((evidence) => ({
    ...evidence,
    testTitle: testItem.title,
    testStatus: testItem.status,
  })));

  if (!items.length) {
    return `
      <article class="result-card evidence-empty">
        <strong>Visual evidence</strong>
        <p>No visual artifact was reported. This can happen when Playwright cannot start the browser or the target application before a test begins. Review the logs above for the blocking point.</p>
      </article>
    `;
  }

  return `
    <article class="result-card">
      <strong>Visual evidence</strong>
      <p>Each test keeps screenshots, video, and a trace whenever Playwright produced them. Open an item below to validate what was exercised.</p>
      <div class="evidence-grid">
        ${items.map((item) => renderEvidenceItem(item)).join("")}
      </div>
    </article>
  `;
}

function renderEvidenceItem(item) {
  const url = artifactUrl(item.relativePath);
  const title = `${item.testTitle} - ${item.kind}`;
  const statusClass = item.testStatus === "passed" ? "high" : item.testStatus === "failed" ? "low" : "medium";

  if (item.kind === "screenshot") {
    return `
      <figure class="evidence-card evidence-card--image">
        <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" title="Open full-size screenshot">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" loading="lazy" />
        </a>
        <figcaption>
          <span class="confidence confidence--${statusClass}">${escapeHtml(item.testStatus)}</span>
          <strong>${escapeHtml(item.testTitle)}</strong>
          <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open screenshot</a>
        </figcaption>
      </figure>
    `;
  }

  if (item.kind === "video") {
    return `
      <article class="evidence-card">
        <video controls preload="metadata" src="${escapeHtml(url)}"></video>
        <div class="evidence-card__meta">
          <span class="confidence confidence--${statusClass}">${escapeHtml(item.testStatus)}</span>
          <strong>${escapeHtml(item.testTitle)}</strong>
          <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open video</a>
        </div>
      </article>
    `;
  }

  return `
    <article class="evidence-card evidence-card--file">
      <span class="evidence-card__type">${escapeHtml(item.kind)}</span>
      <strong>${escapeHtml(item.testTitle)}</strong>
      <p>${escapeHtml(item.name || item.relativePath)}</p>
      <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open ${escapeHtml(item.kind)}</a>
    </article>
  `;
}

function artifactUrl(relativePath) {
  const base = state.generated?.artifactBaseUrl || "";
  return encodeURI(`${base}/${String(relativePath || "").replace(/^\/+/, "")}`);
}

function renderAiUsage() {
  elements.aiUsagePanel.innerHTML = `
    <article class="usage-card">
      <strong>Step 2: inspection</strong>
      <p>The local reader collects the README, structure, manifests, routes, components, and UI hints. An optional live exploration can also boot the target app and inspect the rendered interface before the model refines the project summary.</p>
    </article>
    <article class="usage-card">
      <strong>Steps 3 and 4: flows and criteria</strong>
      <p>The heuristic layer still proposes safe starting flows, but the model now authors the acceptance criteria from scratch using static and live evidence, aiming for broader and less repetitive coverage.</p>
    </article>
    <article class="usage-card">
      <strong>Step 5: test rendering</strong>
      <p>After live exploration, the selected model can author a Playwright body from the approved flow and observed interface. The generated JavaScript is validated before saving; without live evidence, or when it is unsafe, unsupported, or invalid, the deterministic renderer takes over and records that fallback.</p>
    </article>
    <article class="usage-card">
      <strong>Step 7: results and insights</strong>
      <p>Execution data remains objective and local. The result keeps screenshots, video, and traces for visual review, while the model synthesizes a critical reading of the results, limitations, and next steps.</p>
    </article>
  `;
}

function renderChatConsole() {
  if (!state.chatMessages.length) {
    elements.chatTranscript.innerHTML = `
      <div class="empty-state">
        The console is ready. Ask the model about the loaded project, the proposed flows, the test execution, or the next steps in the pipeline.
      </div>
    `;
  } else {
    elements.chatTranscript.innerHTML = state.chatMessages.map(renderChatMessage).join("");
  }

  elements.sendChatButton.disabled = state.chatPending;
  elements.clearChatButton.disabled = state.chatPending || state.chatMessages.length === 0;
  elements.chatInput.disabled = state.chatPending;

  if (state.chatPending) {
    elements.chatTranscript.scrollTop = elements.chatTranscript.scrollHeight;
  }
}

function renderChatMessage(message) {
  return `
    <article class="chat-message chat-message--${escapeHtml(message.role)}">
      <div class="chat-message__meta">
        <strong>${escapeHtml(message.label || (message.role === "user" ? "You" : "Assistant"))}</strong>
        <span>${escapeHtml(formatChatTimestamp(message.timestamp))}</span>
      </div>
      <pre class="chat-message__body">${escapeHtml(message.content)}</pre>
    </article>
  `;
}

function populateRuntimeFields(runtime) {
  elements.runtimeModeInput.value = runtime.mode || "manual";
  elements.installCommandInput.value = runtime.installCommand || "";
  elements.startCommandInput.value = runtime.startCommand || "";
  elements.baseUrlInput.value = runtime.baseUrl || "";
  elements.workingDirectoryInput.value = runtime.workingDirectory || ".";
  elements.runInstallCheckbox.checked = false;
  renderRuntimeModeState();
}

function renderRuntimeModeState() {
  const mode = elements.runtimeModeInput.value;
  const isStatic = mode === "static";
  const isManual = mode === "manual";
  const isExternal = mode === "external";

  elements.installCommandInput.disabled = isStatic || isExternal || isManual;
  elements.startCommandInput.disabled = isStatic || isExternal || isManual;
  elements.baseUrlInput.disabled = isStatic || isManual;
  elements.workingDirectoryInput.disabled = isStatic || isExternal || isManual;
  elements.runInstallCheckbox.disabled = isStatic || isExternal || isManual;

  if (isStatic) {
    elements.baseUrlInput.value = "auto";
    elements.workingDirectoryInput.value = ".";
  }

  updateTimeline();
}

function collectRuntimeConfig() {
  return {
    mode: elements.runtimeModeInput.value,
    installCommand: elements.installCommandInput.value.trim(),
    startCommand: elements.startCommandInput.value.trim(),
    baseUrl: elements.baseUrlInput.value.trim(),
    workingDirectory: elements.workingDirectoryInput.value.trim() || ".",
    runInstallBeforeExecution: elements.runInstallCheckbox.checked,
  };
}

function collectAiConfig() {
  const provider = state.aiConfig.provider || elements.aiProviderInput.value || "heuristic";

  if (provider === "heuristic") {
    return {
      provider: "heuristic",
      endpoint: "",
      model: "",
      apiKey: "",
    };
  }

  return {
    provider,
    endpoint: elements.aiEndpointInput.value.trim(),
    model: (elements.aiModelInput.value.trim() || elements.aiModelSelect.value.trim()),
    apiKey: elements.aiApiKeyInput.value.trim(),
  };
}

function collectApprovedFlows() {
  if (!state.plan) {
    return [];
  }

  return state.plan.flows
    .filter((flow) => flow.approved)
    .map((flow) => ({
      ...flow,
      criteriaText: flow.criteriaText || formatCriteria(flow.criteria),
    }));
}

function formatCriteria(criteria) {
  return (criteria || [])
    .map((criterion) => [
      criterion.title,
      `Given ${criterion.given}`,
      `When ${criterion.when}`,
      `Then ${criterion.then}`,
    ].join("\n"))
    .join("\n\n");
}

function ensureAiDefaults(forceReset = false) {
  const providers = state.aiCatalog?.providers || [];
  const currentProvider = providers.find((provider) => provider.id === state.aiConfig.provider);
  const ollamaProvider = providers.find((provider) => provider.id === "ollama" && provider.available);

  if (!state.aiTouched && ollamaProvider && (forceReset || !currentProvider || state.aiConfig.provider === "heuristic")) {
    state.aiConfig = {
      provider: "ollama",
      endpoint: ollamaProvider.endpoint || "http://127.0.0.1:11434",
      model: getPreferredModel(ollamaProvider.models || []),
      apiKey: "",
    };
    return;
  }

  if (!forceReset && currentProvider) {
    if (currentProvider.id === "ollama") {
      state.aiConfig.endpoint = state.aiConfig.endpoint || currentProvider.endpoint || "http://127.0.0.1:11434";
      state.aiConfig.model = state.aiConfig.model || getPreferredModel(currentProvider.models || []);
      state.aiConfig.apiKey = "";
    }

    if (currentProvider.id !== "heuristic") {
      state.aiConfig.endpoint = state.aiConfig.endpoint || currentProvider.endpoint || "";
      state.aiConfig.model = state.aiConfig.model || getPreferredModel(currentProvider.models || []);
    }

    if (currentProvider.id === "heuristic") {
      state.aiConfig.endpoint = "";
      state.aiConfig.model = "";
      state.aiConfig.apiKey = "";
    }

    return;
  }

  if (ollamaProvider) {
    state.aiConfig = {
      provider: "ollama",
      endpoint: ollamaProvider.endpoint || "http://127.0.0.1:11434",
      model: getPreferredModel(ollamaProvider.models || []),
      apiKey: "",
    };
    return;
  }

  state.aiConfig = { ...DEFAULT_AI_CONFIG };
}

function getPreferredModel(models) {
  if (!Array.isArray(models) || models.length === 0) {
    return "";
  }

  const preferred = models.find((model) => /openllama/i.test(model.name));
  return preferred?.name || models[0].name || "";
}

function getCurrentAiProvider() {
  return (state.aiCatalog?.providers || []).find((provider) => provider.id === state.aiConfig.provider) || null;
}

function buildFallbackAiCatalog(errorMessage = "") {
  return {
    providers: [
      {
        id: "heuristic",
        label: "Local heuristics",
        available: true,
        description: "Internal fallback without using an external model.",
      },
      {
        id: "ollama",
        label: "Local Ollama",
        available: false,
        endpoint: "http://127.0.0.1:11434",
        models: [],
        error: errorMessage || "Could not query the local runtime.",
        description: "Uses models served locally through Ollama.",
      },
      {
        id: "lm-studio",
        label: "Local LM Studio",
        available: false,
        endpoint: "http://127.0.0.1:1234/v1",
        models: [],
        error: errorMessage || "Could not query the local runtime.",
        description: "Uses models loaded locally through LM Studio.",
      },
      {
        id: "openrouter",
        label: "OpenRouter",
        available: true,
        endpoint: "https://openrouter.ai/api/v1",
        models: [],
        requiresApiKey: true,
        description: "Hosted routing across many models.",
      },
      {
        id: "groq",
        label: "Groq",
        available: true,
        endpoint: "https://api.groq.com/openai/v1",
        models: [],
        requiresApiKey: true,
        description: "Hosted OpenAI-compatible inference.",
      },
      {
        id: "hugging-face",
        label: "Hugging Face Inference Providers",
        available: true,
        endpoint: "https://router.huggingface.co/v1",
        models: [],
        requiresApiKey: true,
        description: "Hosted inference providers for Hugging Face models.",
      },
      {
        id: "openai-compatible",
        label: "Custom OpenAI-compatible endpoint",
        available: true,
        endpoint: "",
        models: [],
        description: "Allows the use of a local or remote server compatible with chat completions.",
      },
    ],
  };
}

function renderAiProviderNote(provider) {
  if (!provider || provider.id === "heuristic") {
    elements.aiProviderNote.innerHTML = `
      <strong>Current mode: local heuristics.</strong>
      <p>The pipeline remains functional without an external model, but semantic refinement becomes more conservative.</p>
    `;
    return;
  }

  if (provider.id === "ollama" || provider.id === "lm-studio") {
    const modelNames = (provider.models || []).map((model) => model.name);
    elements.aiProviderNote.innerHTML = `
      <strong>${escapeHtml(provider.label)}</strong>
      <p>Detected endpoint: <code>${escapeHtml(provider.endpoint || "not configured")}</code>.</p>
      <p>${provider.available ? `Models found: ${escapeHtml(modelNames.join(", ") || "none.")}` : `The local runtime did not respond. ${escapeHtml(provider.error || "")}`}</p>
      <p>If the model is not listed, enter the runtime-exposed identifier manually, for example <code>openllama:8b</code>.</p>
    `;
    return;
  }

  elements.aiProviderNote.innerHTML = `
    <strong>${escapeHtml(provider.label)}</strong>
    <p>${escapeHtml(provider.description || "Use a local or remote chat-completions endpoint.")}</p>
    <p>Suggested endpoint: <code>${escapeHtml(provider.endpoint || "enter the endpoint manually")}</code>.</p>
    <p>${provider.requiresApiKey ? "An API key is required by this provider." : "The endpoint may use an optional API key depending on its server configuration."}</p>
  `;
}

function syncAiStatusChip() {
  const provider = getCurrentAiProvider();
  const config = collectAiConfig();

  state.aiConfig = { ...config };

  if (config.provider === "heuristic") {
    setStatus("aiStatus", "Local heuristics", "");
    return;
  }

  if (provider?.available === false && (config.provider === "ollama" || config.provider === "lm-studio")) {
    setStatus("aiStatus", `${provider.label} unavailable`, "is-error");
    return;
  }

  if (!config.model) {
    setStatus("aiStatus", "Model pending", "is-warning");
    return;
  }

  if (!config.endpoint) {
    setStatus("aiStatus", "Endpoint pending", "is-warning");
    return;
  }

  if (provider?.requiresApiKey && !config.apiKey) {
    setStatus("aiStatus", "API key pending", "is-warning");
    return;
  }

  setStatus("aiStatus", `${provider?.label || "Provider"} ready`, "is-ready");
}

function buildModelOptions(models, selectedModel, providerId) {
  if (providerId === "heuristic") {
    return `<option value="">Not applicable in this mode</option>`;
  }

  const options = [];
  const hasSelectedModel = models.some((model) => model.name === selectedModel);

  if (selectedModel && !hasSelectedModel) {
    options.push(`<option value="${escapeHtml(selectedModel)}">${escapeHtml(selectedModel)} (manual)</option>`);
  }

  if (models.length === 0) {
    options.push(`<option value="">No model detected automatically</option>`);
  } else {
    options.push(`<option value="">Choose a detected model</option>`);
    options.push(...models.map((model) => {
      const suffix = [model.family, model.parameterSize].filter(Boolean).join(" / ");
      const label = suffix ? `${model.name} - ${suffix}` : model.name;
      return `<option value="${escapeHtml(model.name)}">${escapeHtml(label)}</option>`;
    }));
  }

  return options.join("");
}

function buildProviderLabel(provider) {
  if (provider.id === "heuristic") {
    return provider.label;
  }

  return provider.available ? provider.label : `${provider.label} (unavailable)`;
}

function describePlanMode(plan) {
  const mapping = {
    heuristic: "Flows derived from local heuristics based on project signals.",
    "ai-augmented": "Heuristic plus live-evidence flow planning: the local reader generated candidates and the model authored richer, project-grounded criteria.",
    "heuristic-fallback": "The model failed during curation. The flows were preserved from the local heuristic layer.",
  };

  return mapping[plan.mode] || plan.summary || "Plan without additional description.";
}

function describePlanAi(aiMetadata) {
  if (!aiMetadata) {
    return "No additional model layer was recorded.";
  }

  const parts = [
    aiMetadata.label || "Local heuristics",
    aiMetadata.stage ? `stage ${aiMetadata.stage}` : "",
  ].filter(Boolean);

  return `Recorded participation: ${parts.join(" - ")}.`;
}

function appendChatMessage({ role, content, label }) {
  state.chatMessages.push({
    id: nextMessageId(),
    role,
    content,
    label,
    timestamp: new Date().toISOString(),
  });
}

function resetChatConsole() {
  state.chatMessages = [];
  state.chatPending = false;
  setStatus("consoleStatus", "Ready", "");
}

function nextMessageId() {
  state.messageCounter += 1;
  return `msg-${state.messageCounter}`;
}

function formatChatTimestamp(value) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (error) {
    return "";
  }
}

function renderList(items, emptyMessage) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p>${escapeHtml(emptyMessage)}</p>`;
  }

  return `<ul class="list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function setStatus(key, text, className) {
  const element = elements[key];
  element.textContent = text;
  element.className = `status-chip ${className || ""}`.trim();
}

function updateTimeline() {
  const progress = {
    selection: Boolean(state.projectPath),
    inspection: Boolean(state.inspection),
    flows: Boolean(state.plan),
    criteria: Boolean(state.plan && collectApprovedFlows().length > 0),
    generation: Boolean(state.generated),
    execution: Boolean(state.execution),
    insights: Boolean(state.insights),
  };

  elements.timelineList.querySelectorAll(".timeline__item").forEach((item) => {
    const step = item.dataset.step;
    item.classList.toggle("is-complete", Boolean(progress[step]));
    item.classList.toggle("is-active", !progress[step] && isPreviousComplete(step, progress));
  });
}

function isPreviousComplete(step, progress) {
  const order = ["selection", "inspection", "flows", "criteria", "generation", "execution", "insights"];
  const position = order.indexOf(step);

  if (position <= 0) {
    return true;
  }

  return order.slice(0, position).every((key) => progress[key]);
}

async function apiGet(url) {
  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function apiPost(url, body = undefined) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function notify(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
