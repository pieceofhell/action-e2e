const DEFAULT_AI_CONFIG = {
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  model: "",
  criticModel: "",
  apiKey: "",
};

const DEFAULT_AUTH_CONFIG = {
  mode: "guest",
  profileId: "local-read-only",
  adapter: "janvas-canvas-token",
  secretEnvVar: "",
  usernameEnvVar: "",
  passwordEnvVar: "",
  providerUrl: "",
  cookieName: "session",
  loginPath: "/login",
  authPaths: "/login",
  usernameSelector: "input[name='username']",
  passwordSelector: "input[type='password']",
  submitSelector: "button[type='submit']",
  successPath: "",
  successText: "",
  allowedPaths: "/profile\n/inbox",
  initialPath: "/profile",
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
  requestToken: "",
  authConfig: { ...DEFAULT_AUTH_CONFIG },
  authConfigurationStatus: null,
  activity: {
    id: "",
    kind: "pipeline",
    label: "Pipeline ready",
    phase: "idle",
    message: "Start an operation to see what E2P is doing behind the scenes.",
    progress: 0,
    status: "idle",
    startedAt: null,
    finishedAt: null,
    events: [],
    detail: null,
  },
};

let activityPollTimer = null;
let activityClockTimer = null;
let explorationViewerExpanded = false;

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
  bugDiscoveryPanel: document.getElementById("bugDiscoveryPanel"),
  bugDiscoveryStatus: document.getElementById("bugDiscoveryStatus"),
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
  aiCriticModelInput: document.getElementById("aiCriticModelInput"),
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
  authStatus: document.getElementById("authStatus"),
  accessModeInput: document.getElementById("accessModeInput"),
  authAdapterInput: document.getElementById("authAdapterInput"),
  authProfileIdInput: document.getElementById("authProfileIdInput"),
  authSecretEnvInput: document.getElementById("authSecretEnvInput"),
  authUsernameEnvInput: document.getElementById("authUsernameEnvInput"),
  authPasswordEnvInput: document.getElementById("authPasswordEnvInput"),
  authProviderUrlInput: document.getElementById("authProviderUrlInput"),
  authCookieNameInput: document.getElementById("authCookieNameInput"),
  authLoginPathInput: document.getElementById("authLoginPathInput"),
  authPathsInput: document.getElementById("authPathsInput"),
  authUsernameSelectorInput: document.getElementById("authUsernameSelectorInput"),
  authPasswordSelectorInput: document.getElementById("authPasswordSelectorInput"),
  authSubmitSelectorInput: document.getElementById("authSubmitSelectorInput"),
  authSuccessPathInput: document.getElementById("authSuccessPathInput"),
  authSuccessTextInput: document.getElementById("authSuccessTextInput"),
  authAllowedPathsInput: document.getElementById("authAllowedPathsInput"),
  authInitialPathInput: document.getElementById("authInitialPathInput"),
  checkAuthButton: document.getElementById("checkAuthButton"),
  authSafetyBanner: document.getElementById("authSafetyBanner"),
  timelineList: document.getElementById("timelineList"),
  activityMonitor: document.getElementById("activityMonitor"),
  activityLabel: document.getElementById("activityLabel"),
  activityMessage: document.getElementById("activityMessage"),
  activityPercent: document.getElementById("activityPercent"),
  activityElapsed: document.getElementById("activityElapsed"),
  activityProgress: document.getElementById("activityProgress"),
  activityProgressFill: document.getElementById("activityProgressFill"),
  activityLog: document.getElementById("activityLog"),
  explorationToggleButton: document.getElementById("explorationToggleButton"),
  explorationViewer: document.getElementById("explorationViewer"),
  explorationPreviewImage: document.getElementById("explorationPreviewImage"),
  explorationPreviewEmpty: document.getElementById("explorationPreviewEmpty"),
  explorationPreviewCaption: document.getElementById("explorationPreviewCaption"),
  explorationStepLabel: document.getElementById("explorationStepLabel"),
  explorationStateStatus: document.getElementById("explorationStateStatus"),
  explorationActionSummary: document.getElementById("explorationActionSummary"),
  explorationFacts: document.getElementById("explorationFacts"),
  explorationHistory: document.getElementById("explorationHistory"),
  howItWorksButton: document.getElementById("howItWorksButton"),
  howItWorksDialog: document.getElementById("howItWorksDialog"),
  closeHowItWorksButton: document.getElementById("closeHowItWorksButton"),
  toast: document.getElementById("toast"),
};

bootstrap();

async function bootstrap() {
  wireEvents();
  renderAiUsage();
  renderAll();
  renderActivity();
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
  elements.aiCriticModelInput.addEventListener("input", handleAiInputChange);
  elements.aiEndpointInput.addEventListener("input", handleAiInputChange);
  elements.aiApiKeyInput.addEventListener("input", handleAiInputChange);
  elements.refreshAiButton.addEventListener("click", handleRefreshAiProviders);
  elements.sendChatButton.addEventListener("click", handleSendChat);
  elements.clearChatButton.addEventListener("click", handleClearChat);
  elements.chatInput.addEventListener("keydown", handleChatKeydown);
  elements.accessModeInput.addEventListener("change", handleAccessModeChange);
  elements.authAdapterInput.addEventListener("change", handleAuthAdapterChange);
  elements.checkAuthButton.addEventListener("click", handleCheckAuthConfiguration);
  elements.howItWorksButton.addEventListener("click", handleOpenWorkflowGuide);
  elements.closeHowItWorksButton.addEventListener("click", handleCloseWorkflowGuide);
  elements.howItWorksDialog.addEventListener("click", handleWorkflowDialogClick);
  elements.howItWorksDialog.addEventListener("close", handleWorkflowDialogClosed);
  elements.explorationToggleButton.addEventListener("click", handleExplorationViewerToggle);
  document.querySelectorAll(".auth-config-grid input, .auth-config-grid textarea").forEach((input) => {
    input.addEventListener("input", handleAuthConfigInput);
  });
}

function handleExplorationViewerToggle() {
  explorationViewerExpanded = !explorationViewerExpanded;
  renderActivity();
}

function handleOpenWorkflowGuide() {
  document.body.classList.add("has-open-dialog");
  elements.howItWorksDialog.showModal();
}

function handleCloseWorkflowGuide() {
  elements.howItWorksDialog.close();
}

function handleWorkflowDialogClick(event) {
  if (event.target === elements.howItWorksDialog) {
    elements.howItWorksDialog.close();
  }
}

function handleWorkflowDialogClosed() {
  document.body.classList.remove("has-open-dialog");
}

async function refreshHealth() {
  try {
    const payload = await apiGet("/api/health");
    state.requestToken = payload.requestToken || "";
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
    const payload = await runTrackedOperation({
      kind: "selection",
      label: "Choosing a project folder",
      request: (operationId) => apiPost("/api/project/select", { operationId }),
    });

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
    const payload = await runTrackedOperation({
      kind: "inspection",
      label: "Inspecting the selected project",
      request: (operationId) => apiPost("/api/project/load", {
        operationId,
        projectPath,
        aiConfig: collectAiConfig(),
      }),
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
    elements.generatePlanButton.disabled = true;
    elements.generateTestsButton.disabled = true;
    elements.runTestsButton.disabled = true;

    renderAll();

    notify("AI project understanding completed. Run live interface exploration to continue.");
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

  if (collectAuthConfig().mode === "authenticated" && !state.authConfigurationStatus?.configured) {
    notify("Check the authenticated profile configuration before live exploration.");
    return;
  }

  try {
    setStatus("inspectionStatus", "Exploring live app...", "is-warning");
    elements.exploreLiveButton.disabled = true;

    const payload = await runTrackedOperation({
      kind: "exploration",
      label: "Exploring the live application",
      request: (operationId) => apiPost("/api/project/explore-live", {
        operationId,
        projectPath: state.projectPath,
        inspection: state.inspection,
        runtimeConfig: collectRuntimeConfig(),
        aiConfig: collectAiConfig(),
        authConfig: collectAuthConfig(),
      }),
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
      if (liveExploration.runtimeErrors?.length) {
        setStatus("inspectionStatus", "Runtime error detected", "is-error");
        notify("Live evidence was captured, but the target displayed a development runtime error. Review it before generating tests.");
        return;
      }

      if (liveExploration.access?.mode === "authenticated") {
        state.authConfigurationStatus = {
          ...(state.authConfigurationStatus || {}),
          configured: true,
          verified: true,
        };
        renderAuthConfiguration();
      }
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

  const agent = state.inspection.liveExploration?.agenticExploration;
  if (state.inspection.liveExploration?.status !== "completed" || !agent?.usedModel || agent.status !== "completed") {
    notify("Complete a successful model-guided live exploration before generating flows.");
    return;
  }

  try {
    setStatus("criteriaStatus", "Generating...", "is-warning");
    const payload = await runTrackedOperation({
      kind: "planning",
      label: "Generating user flows and acceptance criteria",
      request: (operationId) => apiPost("/api/pipeline/plan", {
        operationId,
        inspection: state.inspection,
        aiConfig: collectAiConfig(),
        authConfig: collectAuthConfig(),
      }),
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
    const payload = await runTrackedOperation({
      kind: "generation",
      label: "Generating E2E test artifacts",
      request: (operationId) => apiPost("/api/tests/generate", {
        operationId,
        projectPath: state.projectPath,
        inspection: state.inspection,
        approvedFlows,
        runtimeConfig: collectRuntimeConfig(),
        aiConfig: collectAiConfig(),
        authConfig: collectAuthConfig(),
      }),
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

  if (collectAuthConfig().mode === "authenticated" && !state.authConfigurationStatus?.configured) {
    notify("Check the authenticated profile configuration before running authenticated tests.");
    return;
  }

  try {
    setStatus("executionStatus", "Running...", "is-warning");
    const payload = await runTrackedOperation({
      kind: "execution",
      label: "Running generated E2E tests",
      request: (operationId) => apiPost("/api/tests/run", {
        operationId,
        projectPath: state.projectPath,
        inspection: state.inspection,
        approvedFlows,
        generated: state.generated,
        aiConfig: collectAiConfig(),
        authConfig: collectAuthConfig(),
      }),
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
    const payload = await runTrackedOperation({
      kind: "model-console",
      label: "Querying the selected model",
      request: (operationId) => apiPost("/api/ai/chat", {
        operationId,
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
      }),
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
      criticModel: "",
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

function handleAccessModeChange() {
  state.authConfig.mode = elements.accessModeInput.value;
  state.authConfigurationStatus = state.authConfig.mode === "guest"
    ? { configured: true, mode: "guest" }
    : null;
  invalidatePostInspectionPipeline();
  renderAll();
}

function handleAuthAdapterChange() {
  const previousAdapter = state.authConfig.adapter;
  state.authConfig.adapter = elements.authAdapterInput.value;

  if (state.authConfig.adapter === "janvas-canvas-token" && previousAdapter !== state.authConfig.adapter) {
    elements.authInitialPathInput.value = "/profile";
    elements.authAllowedPathsInput.value = "/profile\n/inbox";
  } else if (previousAdapter !== state.authConfig.adapter) {
    elements.authInitialPathInput.value = "/";
    elements.authAllowedPathsInput.value = "/";
  }

  state.authConfigurationStatus = null;
  invalidatePostInspectionPipeline();
  renderAll();
}

function handleAuthConfigInput() {
  state.authConfig = collectAuthConfig();
  state.authConfigurationStatus = null;
  invalidatePostInspectionPipeline();
  renderAuthConfiguration();
  updateTimeline();
}

async function handleCheckAuthConfiguration() {
  try {
    elements.checkAuthButton.disabled = true;
    setStatus("authStatus", "Checking...", "is-warning");
    const payload = await apiPost("/api/auth/status", {
      authConfig: collectAuthConfig(),
    });
    state.authConfigurationStatus = payload;
    renderAuthConfiguration();

    if (payload.configured) {
      notify("The authenticated profile is configured. No credential value was returned to the browser.");
    } else {
      notify(payload.error || `Missing secret fields: ${(payload.missingFields || []).join(", ")}.`);
    }
  } catch (error) {
    state.authConfigurationStatus = { configured: false, error: error.message };
    renderAuthConfiguration();
    notify(error.message);
  } finally {
    elements.checkAuthButton.disabled = false;
  }
}

function invalidatePostInspectionPipeline() {
  state.plan = null;
  state.generated = null;
  state.execution = null;
  state.insights = null;
  elements.generateTestsButton.disabled = true;
  elements.runTestsButton.disabled = true;
}

function renderAll() {
  renderAiConfiguration();
  renderAuthConfiguration();
  renderChatConsole();
  renderInspection();
  renderBugDiscovery();
  renderFlows();
  renderArtifacts();
  renderResults();
  renderRuntimeModeState();
  updateTimeline();
}

function renderAiConfiguration() {
  const providers = state.aiCatalog?.providers || buildFallbackAiCatalog().providers;
  const currentProviderId = state.aiConfig.provider || "ollama";
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
  elements.aiCriticModelInput.value = state.aiConfig.criticModel || "";
  elements.aiEndpointInput.value = state.aiConfig.endpoint;
  elements.aiApiKeyInput.value = state.aiConfig.apiKey;

  const disableModelFields = state.aiConfig.provider === "heuristic";
  elements.aiModelSelect.disabled = disableModelFields;
  elements.aiModelInput.disabled = disableModelFields;
  elements.aiCriticModelInput.disabled = disableModelFields;
  elements.aiEndpointInput.disabled = disableModelFields;
  elements.aiApiKeyInput.disabled = disableModelFields || !(provider?.requiresApiKey || state.aiConfig.provider === "openai-compatible");

  renderAiProviderNote(provider);
  renderAiUsage();
  syncAiStatusChip();
}

function renderAuthConfiguration() {
  const config = state.authConfig || DEFAULT_AUTH_CONFIG;
  const isAuthenticated = config.mode === "authenticated";
  const adapter = config.adapter || "janvas-canvas-token";

  elements.accessModeInput.value = config.mode;
  elements.authAdapterInput.value = adapter;
  elements.authProfileIdInput.value = config.profileId;
  elements.authSecretEnvInput.value = config.secretEnvVar;
  elements.authUsernameEnvInput.value = config.usernameEnvVar;
  elements.authPasswordEnvInput.value = config.passwordEnvVar;
  elements.authProviderUrlInput.value = config.providerUrl;
  elements.authCookieNameInput.value = config.cookieName;
  elements.authLoginPathInput.value = config.loginPath;
  elements.authPathsInput.value = config.authPaths;
  elements.authUsernameSelectorInput.value = config.usernameSelector;
  elements.authPasswordSelectorInput.value = config.passwordSelector;
  elements.authSubmitSelectorInput.value = config.submitSelector;
  elements.authSuccessPathInput.value = config.successPath;
  elements.authSuccessTextInput.value = config.successText;
  elements.authAllowedPathsInput.value = config.allowedPaths;
  elements.authInitialPathInput.value = config.initialPath;

  document.querySelectorAll(".auth-only").forEach((element) => {
    element.classList.toggle("is-hidden", !isAuthenticated);
  });
  document.querySelectorAll(".auth-secret-field").forEach((element) => {
    element.classList.toggle("is-hidden", !isAuthenticated || ["form-login", "http-basic"].includes(adapter));
  });
  document.querySelectorAll(".auth-user-field").forEach((element) => {
    element.classList.toggle("is-hidden", !isAuthenticated || !["form-login", "http-basic"].includes(adapter));
  });
  document.querySelectorAll(".auth-janvas-field").forEach((element) => {
    element.classList.toggle("is-hidden", !isAuthenticated || adapter !== "janvas-canvas-token");
  });
  document.querySelectorAll(".auth-cookie-field").forEach((element) => {
    element.classList.toggle("is-hidden", !isAuthenticated || adapter !== "cookie-session");
  });
  document.querySelectorAll(".auth-form-field").forEach((element) => {
    element.classList.toggle("is-hidden", !isAuthenticated || adapter !== "form-login");
  });

  if (!isAuthenticated) {
    setStatus("authStatus", "Guest", "");
    elements.authSafetyBanner.innerHTML = "Guest mode uses the existing pipeline and does not prepare an authenticated session.";
    return;
  }

  const status = state.authConfigurationStatus;
  if (status?.configured) {
    setStatus("authStatus", "Configured / read-only", "is-ready");
  } else if (status) {
    setStatus("authStatus", "Secret missing", "is-error");
  } else {
    setStatus("authStatus", "Check required", "is-warning");
  }

  elements.authSafetyBanner.innerHTML = `
    <strong>Authenticated / read-only</strong>
    <span>The ${escapeHtml(adapter)} adapter will use an isolated session. Mutating requests are blocked, traces and videos are disabled, and post-authentication screenshots are scanned before release.</span>
  `;
}

function renderInspection() {
  if (!state.inspection) {
    elements.inspectionSummary.innerHTML = "The project analysis has not been run yet.";
    elements.inspectionSummary.className = "summary-grid empty-state";
    return;
  }

  const { inspection } = state;
  const aiLabel = inspection.ai?.label || "AI model unavailable";
  const aiStage = inspection.ai?.stage || "not-completed";
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
  const access = liveExploration.access || { mode: "guest" };
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
      <p>Access: ${escapeHtml(access.mode || "guest")}${access.adapter && access.adapter !== "none" ? ` via ${escapeHtml(access.adapter)}` : ""}</p>
      ${access.status ? `<p>Session status: ${escapeHtml(access.status)}</p>` : ""}
      ${access.policy ? `<p>Blocked requests: ${access.policy.blockedRequestCount || 0}</p>` : ""}
      <p>Observed routes: ${summary.routeCount ?? 0}</p>
      <p>Unique visible actions: ${(summary.uniqueButtons || []).length}</p>
      <p>Unique visible inputs: ${(summary.uniqueInputs || []).length}</p>
      <p>Runtime health: ${escapeHtml(liveExploration.health || "unknown")}</p>
      ${renderList(routeItems, "No route-level observations were captured.")}
      ${renderList(liveExploration.runtimeErrors || [], "No development runtime overlay was detected.")}
      ${
        liveExploration.error
          ? `<p>Recorded live-exploration failure: ${escapeHtml(liveExploration.error)}</p>`
          : ""
      }
    </article>
  `;
}

function renderBugDiscovery() {
  const liveExploration = state.inspection?.liveExploration;
  const report = liveExploration?.bugDiscovery;

  if (!report) {
    setStatus("bugDiscoveryStatus", "Pending", "");
    elements.bugDiscoveryPanel.className = "stack empty-state";
    elements.bugDiscoveryPanel.innerHTML = "Run guest live exploration to produce a defect-discovery report.";
    return;
  }

  const hypotheses = Array.isArray(report.hypotheses) ? report.hypotheses : [];
  const statusClass = report.status === "completed"
    ? "is-ready"
    : report.status === "failed" ? "is-error" : "is-warning";
  setStatus(
    "bugDiscoveryStatus",
    report.status === "completed" ? `${hypotheses.length} hypothesis${hypotheses.length === 1 ? "" : "es"}` : report.status,
    statusClass,
  );
  elements.bugDiscoveryPanel.className = "stack";

  const reportUrl = liveExploration.artifactRun?.artifactBaseUrl
    ? `${liveExploration.artifactRun.artifactBaseUrl}/results/potential-bugs.json`
    : "";
  elements.bugDiscoveryPanel.innerHTML = `
    <article class="defect-report-summary">
      <div>
        <strong>${escapeHtml(report.summary || "Defect discovery finished without a summary.")}</strong>
        <p>${escapeHtml(report.model || "No model recorded")} &middot; ${escapeHtml(report.evidenceMode || "structured evidence")} &middot; ${report.analyzedStateCount || 0} state(s) &middot; ${report.screening?.rejected || 0} candidate(s) filtered by the critic</p>
      </div>
      ${reportUrl ? `<a class="button button--quiet" href="${escapeHtml(reportUrl)}" target="_blank" rel="noopener">Open JSON report</a>` : ""}
    </article>
    ${hypotheses.length
      ? hypotheses.map(renderBugHypothesis).join("")
      : `<article class="summary-card"><strong>No retained hypothesis</strong><p>The model did not find enough grounded evidence in the states it reached. This is not proof that the application has no defects.</p></article>`}
    ${(report.rejectedHypotheses || []).length ? `
      <details class="rejected-hypotheses">
        <summary>${report.rejectedHypotheses.length} candidate hypothesis${report.rejectedHypotheses.length === 1 ? "" : "es"} rejected by conservative review</summary>
        <div class="stack">${report.rejectedHypotheses.map((item) => `
          <article>
            <strong>${escapeHtml(item.title || "Untitled candidate")}</strong>
            <p class="muted">Author confidence: ${escapeHtml(item.authorConfidence || "not recorded")} &middot; Reviewer confidence: ${escapeHtml(item.reviewerConfidence || "not recorded")} &middot; Suggested severity: ${escapeHtml(item.authorSeverity || "not recorded")}</p>
            <p>${escapeHtml(item.reason || "No reason recorded.")}</p>
          </article>
        `).join("")}</div>
      </details>
    ` : ""}
    ${(report.errors || []).length ? `<article class="summary-card"><strong>Stage warnings</strong>${renderList(report.errors, "")}</article>` : ""}
    <article class="defect-limitations">
      <strong>Human validation remains required</strong>
      ${renderList(report.limitations || [], "No additional limitation was recorded.")}
    </article>
  `;
}

function renderBugHypothesis(hypothesis, index) {
  const observed = hypothesis.observed || {};
  const expected = hypothesis.expected || {};
  const evidence = hypothesis.evidence || {};
  const facts = Array.isArray(observed.facts) ? observed.facts : [];
  const screenshots = Array.isArray(evidence.screenshots) ? evidence.screenshots : [];
  const consoleErrors = [...(evidence.consoleErrors || []), ...(evidence.pageErrors || [])];

  return `
    <article class="defect-card">
      <header class="defect-card__header">
        <div>
          <p class="kicker">Hypothesis ${index + 1}</p>
          <h3>${escapeHtml(hypothesis.title || "Untitled potential defect")}</h3>
          <p>${escapeHtml(hypothesis.objectiveDescription || "No additional description was supplied.")}</p>
        </div>
        <div class="defect-badges">
          <span class="confidence confidence--${escapeHtml(hypothesis.severity || "medium")}">${escapeHtml(hypothesis.severity || "medium")} severity</span>
          <span class="confidence confidence--${escapeHtml(hypothesis.confidence || "low")}">${escapeHtml(hypothesis.confidence || "low")} confidence</span>
          <span class="status-chip is-warning">Unconfirmed</span>
        </div>
      </header>

      <div class="defect-context">
        <div><strong>Affected flow</strong><p>${escapeHtml(hypothesis.affectedFlow || "Not specified")}</p></div>
        <div><strong>Preconditions</strong>${renderList(hypothesis.preconditions || [], "No explicit precondition.")}</div>
        <div><strong>Reproduction steps</strong>${renderNumberedList(hypothesis.reproductionSteps || [], "No grounded reproduction path was retained.")}</div>
      </div>

      <div class="defect-claim-grid">
        <section class="defect-claim defect-claim--fact">
          <p class="kicker">Observed facts</p>
          <strong>${escapeHtml(observed.result || "No observed result was retained.")}</strong>
          ${facts.length ? `<ul class="list">${facts.map((fact) => `
            <li>${escapeHtml(fact.statement)} <small>${escapeHtml((fact.evidenceRefs || []).join(", "))}</small></li>
          `).join("")}</ul>` : "<p>No grounded fact was retained.</p>"}
        </section>
        <section class="defect-claim defect-claim--inference">
          <p class="kicker">Expected behavior &mdash; inference</p>
          <strong>${escapeHtml(expected.result || "No expectation was retained.")}</strong>
          <p>${escapeHtml(expected.justification || "No justification was supplied.")}</p>
          <small>Inference source: ${escapeHtml(expected.source || "model-inference")}</small>
        </section>
      </div>

      ${screenshots.length ? `<div class="defect-screenshots">${screenshots.slice(0, 8).map((item) => `
        <a href="${escapeHtml(item.artifactUrl)}" target="_blank" rel="noopener">
          <img src="${escapeHtml(item.artifactUrl)}" alt="Evidence from ${escapeHtml(item.stateId || "explored state")}" loading="lazy" />
          <span>${escapeHtml(item.stateId || item.fileName || "Screenshot")}</span>
        </a>
      `).join("")}</div>` : ""}
      ${consoleErrors.length ? `<details class="defect-diagnostics"><summary>Browser errors (${consoleErrors.length})</summary>${renderList(consoleErrors.map((item) => item.message || String(item)), "")}</details>` : ""}
      ${hypothesis.criticReview ? `<p class="defect-critic"><strong>Conservative review:</strong> ${escapeHtml(hypothesis.criticReview.reason)} (${escapeHtml(hypothesis.criticReview.confidence || "low")} confidence)</p>` : ""}
    </article>
  `;
}

function renderNumberedList(items, emptyMessage) {
  if (!Array.isArray(items) || !items.length) return `<p>${escapeHtml(emptyMessage)}</p>`;
  return `<ol class="numbered-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
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

  const aiLabel = state.plan?.ai?.label || state.inspection?.ai?.label || "AI model unavailable";

  elements.generatedArtifacts.className = "stack";
  elements.generatedArtifacts.innerHTML = `
    <article class="artifact-card">
      <strong>Isolated execution</strong>
      <p><code>${escapeHtml(state.generated.runDirectory)}</code></p>
      <p>The tests were generated outside the analyzed project, in a dedicated prototype directory.</p>
      <p>Semantic layer used during preparation: ${escapeHtml(aiLabel)}</p>
      <p>Access mode: ${escapeHtml(state.generated.access?.mode || "guest")}${state.generated.access?.adapter && state.generated.access.adapter !== "none" ? ` via ${escapeHtml(state.generated.access.adapter)}` : ""}</p>
      <div class="artifact-links">
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/generated-tests.json`)}" target="_blank" rel="noreferrer">generated-tests.json</a>
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/approved-flows.json`)}" target="_blank" rel="noreferrer">approved-flows.json</a>
        <a href="${escapeHtml(`${state.generated.artifactBaseUrl}/runtime-config.json`)}" target="_blank" rel="noreferrer">runtime-config.json</a>
        ${state.generated.access?.mode === "authenticated" ? `<a href="${escapeHtml(`${state.generated.artifactBaseUrl}/auth-metadata.json`)}" target="_blank" rel="noreferrer">auth-metadata.json</a>` : ""}
      </div>
    </article>
    ${state.generated.generatedTests.map((testFile) => `
      <article class="artifact-card">
        <strong>${escapeHtml(testFile.title)}</strong>
        <p><code>${escapeHtml(testFile.fileName)}</code></p>
        <p>Authoring mode: ${escapeHtml(testFile.generationMode || "unknown")}</p>
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
  const aiLabel = state.insights.ai?.label || state.plan?.ai?.label || state.inspection?.ai?.label || "AI model unavailable";

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
      ${renderExecutionAccessSummary(state.execution)}
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
      <p>${state.execution?.auth?.mode === "authenticated"
        ? "Authenticated runs keep post-authentication screenshots only. Traces, videos, headers, cookies, and network payloads are intentionally excluded."
        : "Each guest test keeps screenshots, video, and a trace whenever Playwright produced them. Open an item below to validate what was exercised."}</p>
      <div class="evidence-grid">
        ${items.map((item) => renderEvidenceItem(item)).join("")}
      </div>
    </article>
  `;
}

function renderExecutionAccessSummary(execution) {
  if (execution?.auth?.mode !== "authenticated") {
    return "<p>Access mode: guest</p>";
  }

  return `
    <div class="auth-result-summary">
      <p><strong>Authenticated / read-only</strong> via ${escapeHtml(execution.auth.adapter || "configured adapter")}</p>
      <p>Session: ${escapeHtml(execution.auth.status || "unknown")}</p>
      <p>Blocked requests: ${execution.policy?.blockedRequestCount || 0}</p>
      <p>Secret scan: ${escapeHtml(execution.secretScan?.status || "unknown")} (${execution.secretScan?.scannedFiles || 0} files)</p>
    </div>
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
      <p>The local reader collects grounded evidence from documentation, manifests, routes, components, and UI hints. The model then interprets that evidence instead of guessing from a project name alone.</p>
    </article>
    <article class="usage-card">
      <strong>Step 3: authenticated context</strong>
      <p>When enabled, a trusted adapter resolves environment-backed secrets on the server, prepares an ephemeral session, and exposes only sanitized read-only observations to the model.</p>
    </article>
    <article class="usage-card">
      <strong>Step 4: live exploration</strong>
      <p>Playwright exposes a bounded set of safe, visible actions. The model chooses what to do next, receives the resulting interface state, and builds a traceable journey through the application.</p>
    </article>
    <article class="usage-card">
      <strong>Steps 5 and 6: flows and criteria</strong>
      <p>The model authors behavior-rich user flows and acceptance criteria, citing the interface states that support each proposal. The user remains responsible for reviewing and approving them.</p>
    </article>
    <article class="usage-card">
      <strong>Step 7: test generation</strong>
      <p>Model-authored Playwright is validated before saving. If its code is unsafe or ungrounded, E2P may compile only the journey the model actually executed; without that evidence, the pipeline stops.</p>
    </article>
    <article class="usage-card">
      <strong>Step 8: results and insights</strong>
      <p>Execution data remains objective and local. Screenshots, video, traces, and coverage distinguish free-form AI tests from compiled model journeys before the model synthesizes insights.</p>
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

function collectAuthConfig() {
  const config = {
    mode: elements.accessModeInput.value || "guest",
    profileId: elements.authProfileIdInput.value.trim(),
    adapter: elements.authAdapterInput.value,
    secretEnvVar: elements.authSecretEnvInput.value.trim(),
    usernameEnvVar: elements.authUsernameEnvInput.value.trim(),
    passwordEnvVar: elements.authPasswordEnvInput.value.trim(),
    providerUrl: elements.authProviderUrlInput.value.trim(),
    cookieName: elements.authCookieNameInput.value.trim(),
    loginPath: elements.authLoginPathInput.value.trim(),
    authPaths: elements.authPathsInput.value.trim(),
    usernameSelector: elements.authUsernameSelectorInput.value.trim(),
    passwordSelector: elements.authPasswordSelectorInput.value.trim(),
    submitSelector: elements.authSubmitSelectorInput.value.trim(),
    successPath: elements.authSuccessPathInput.value.trim(),
    successText: elements.authSuccessTextInput.value.trim(),
    allowedPaths: elements.authAllowedPathsInput.value,
    initialPath: elements.authInitialPathInput.value.trim(),
  };

  state.authConfig = { ...config };
  return config;
}

function collectAiConfig() {
  const provider = state.aiConfig.provider || elements.aiProviderInput.value || "ollama";

  if (provider === "heuristic") {
    return {
      provider: "heuristic",
      endpoint: "",
      model: "",
      criticModel: "",
      apiKey: "",
    };
  }

  return {
    provider,
    endpoint: elements.aiEndpointInput.value.trim(),
    model: (elements.aiModelInput.value.trim() || elements.aiModelSelect.value.trim()),
    criticModel: elements.aiCriticModelInput.value.trim(),
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

  if (!state.aiTouched) {
    const ollama = providers.find((provider) => provider.id === "ollama" && provider.available !== false);
    const firstAvailable = ollama || providers.find((provider) => provider.available !== false);
    state.aiConfig = firstAvailable
      ? {
          provider: firstAvailable.id,
          endpoint: firstAvailable.endpoint || "",
          model: getPreferredModel(firstAvailable.models || []),
          apiKey: "",
        }
      : { ...DEFAULT_AI_CONFIG };
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

  state.aiConfig = { ...DEFAULT_AI_CONFIG };
}

function getPreferredModel(models) {
  if (!Array.isArray(models) || models.length === 0) {
    return "";
  }

  const preferred = models.find((model) => /qwen3:8b/i.test(model.name))
    || models.find((model) => /qwen/i.test(model.name))
    || models.find((model) => /openllama/i.test(model.name));
  return preferred?.name || models[0].name || "";
}

function getCurrentAiProvider() {
  return (state.aiCatalog?.providers || []).find((provider) => provider.id === state.aiConfig.provider) || null;
}

function buildFallbackAiCatalog(errorMessage = "") {
  return {
    providers: [
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
      <strong>Current mode: non-AI comparison baseline.</strong>
      <p>No model inference will run. Select a configured model to evaluate AI behavior; this mode exists only as a control condition and recovery path.</p>
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
    setStatus("aiStatus", "Non-AI baseline", "");
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
    "ai-first": "The selected model authored every flow and criterion from completed live interface evidence.",
    "authenticated-ai-first": "The selected model authored read-only authenticated flows from verified live interface evidence.",
    heuristic: "Explicit non-AI baseline mode.",
  };

  return mapping[plan.mode] || plan.summary || "Plan without additional description.";
}

function describePlanAi(aiMetadata) {
  if (!aiMetadata) {
    return "No additional model layer was recorded.";
  }

  const parts = [
    aiMetadata.label || "AI model unavailable",
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
  if (!elements.timelineList) return;
  const accessReady = Boolean(state.inspection)
    && (state.authConfig.mode === "guest" || Boolean(state.authConfigurationStatus?.configured));
  const progress = {
    selection: Boolean(state.projectPath),
    inspection: Boolean(state.inspection),
    access: accessReady,
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
  const order = ["selection", "inspection", "access", "flows", "criteria", "generation", "execution", "insights"];
  const position = order.indexOf(step);

  if (position <= 0) {
    return true;
  }

  return order.slice(0, position).every((key) => progress[key]);
}

async function runTrackedOperation({ kind, label, request }) {
  if (state.activity.status === "running") {
    throw new Error(`Wait for "${state.activity.label}" to finish before starting another operation.`);
  }

  const operationId = createOperationId();
  explorationViewerExpanded = false;
  const startedAt = new Date().toISOString();
  state.activity = {
    id: operationId,
    kind,
    label,
    phase: "queued",
    message: "Sending the operation to the local E2P server...",
    progress: 1,
    status: "running",
    startedAt,
    finishedAt: null,
    events: [{
      phase: "queued",
      message: "Operation queued by the interface.",
      progress: 1,
      at: startedAt,
    }],
  };
  renderActivity();
  startActivityTimers(operationId);

  try {
    const payload = await request(operationId);
    await pollActivity(operationId);

    if (state.activity.id === operationId && state.activity.status === "running") {
      finishLocalActivity("completed", "Operation completed.");
    }
    return payload;
  } catch (error) {
    await pollActivity(operationId);
    if (state.activity.id === operationId && state.activity.status === "running") {
      finishLocalActivity("failed", error.message || "The operation failed.");
    }
    throw error;
  } finally {
    stopActivityTimers();
    renderActivity();
  }
}

function startActivityTimers(operationId) {
  stopActivityTimers();
  activityPollTimer = setInterval(() => {
    void pollActivity(operationId);
  }, 450);
  activityClockTimer = setInterval(updateActivityElapsed, 1000);
}

function stopActivityTimers() {
  clearInterval(activityPollTimer);
  clearInterval(activityClockTimer);
  activityPollTimer = null;
  activityClockTimer = null;
}

async function pollActivity(operationId) {
  if (!operationId || state.activity.id !== operationId) return;

  try {
    const payload = await apiGet(`/api/operations/${encodeURIComponent(operationId)}`);
    if (state.activity.id !== operationId || !payload.operation) return;
    state.activity = payload.operation;
    renderActivity();
  } catch (error) {
    // The first poll can arrive before the POST handler registers the operation.
  }
}

function finishLocalActivity(status, message) {
  const finishedAt = new Date().toISOString();
  state.activity = {
    ...state.activity,
    status,
    phase: status,
    message,
    progress: status === "completed" ? 100 : state.activity.progress,
    finishedAt,
    events: [...state.activity.events, {
      phase: status,
      message,
      progress: status === "completed" ? 100 : state.activity.progress,
      at: finishedAt,
    }].slice(-16),
  };
  renderActivity();
}

function renderActivity() {
  const activity = state.activity;
  const progress = Math.max(0, Math.min(100, Number(activity.progress) || 0));
  elements.activityMonitor.dataset.status = activity.status || "idle";
  elements.activityLabel.textContent = activity.label || "Pipeline ready";
  elements.activityMessage.textContent = activity.message || "Waiting for the next operation.";
  elements.activityPercent.textContent = `${Math.round(progress)}%`;
  elements.activityProgress.setAttribute("aria-valuenow", String(Math.round(progress)));
  elements.activityProgressFill.style.width = `${progress}%`;
  updateActivityElapsed();
  renderExplorationViewer(activity);

  const recentEvents = (activity.events || []).slice(-3);
  if (!recentEvents.length) {
    elements.activityLog.innerHTML = "<li><span>Ready</span><p>Operation milestones will appear here as they happen.</p></li>";
    return;
  }

  elements.activityLog.innerHTML = recentEvents.map((event) => `
    <li>
      <span>${escapeHtml(formatActivityPhase(event.phase))}</span>
      <p title="${escapeHtml(event.message)}">${escapeHtml(event.message)}</p>
    </li>
  `).join("");
}

function renderExplorationViewer(activity) {
  const detail = activity.detail?.type === "exploration" ? activity.detail : null;
  const completed = Boolean(detail && activity.status !== "running");
  elements.explorationToggleButton.hidden = !completed;
  elements.explorationToggleButton.textContent = explorationViewerExpanded ? "Hide exploration" : "Review exploration";
  elements.explorationViewer.hidden = !detail || (completed && !explorationViewerExpanded);
  if (!detail) return;

  const stateEvidence = detail.state || {};
  const action = detail.action;
  const hasPreview = Boolean(detail.visualPreviewAllowed && detail.screenshotDataUrl);
  elements.explorationPreviewImage.hidden = !hasPreview;
  elements.explorationPreviewEmpty.hidden = hasPreview;
  if (hasPreview) {
    elements.explorationPreviewImage.src = detail.screenshotDataUrl;
  } else {
    elements.explorationPreviewImage.removeAttribute("src");
    elements.explorationPreviewEmpty.textContent = detail.visualPreviewAllowed
      ? "The current page could not be captured, but its structured state is still shown."
      : "Visual preview is disabled for authenticated sessions to protect private content.";
  }

  elements.explorationPreviewCaption.textContent = `${stateEvidence.title || "Target application"} - ${stateEvidence.path || "/"}`;
  elements.explorationStepLabel.textContent = `Decision ${detail.step || 1} · adaptive budget ${detail.maxSteps || 1}`;
  elements.explorationStateStatus.textContent = detail.status === "observed" ? "State captured" : "Model thinking";

  if (action) {
    const valueText = action.value ? ` using &ldquo;${escapeHtml(action.value)}&rdquo;` : "";
    const correction = action.protocolCorrection
      ? `<p class="exploration-action__correction">Protocol correction: ${escapeHtml(action.protocolCorrection)}</p>`
      : "";
    elements.explorationActionSummary.innerHTML = `
      <span class="exploration-action__kind">${escapeHtml(action.kind)}</span>
      <div>
        <strong>${escapeHtml(action.name)}${valueText}</strong>
        <p>${escapeHtml(action.rationale || "The model selected this visible safe action.")}</p>
        ${action.expectedOutcome ? `<p><b>Expected:</b> ${escapeHtml(action.expectedOutcome)}</p>` : ""}
        ${correction}
      </div>
    `;
  } else {
    elements.explorationActionSummary.innerHTML = `
      <span class="exploration-action__kind">observe</span>
      <div><strong>Reviewing the current interface</strong><p>The model is choosing one action from the controls currently exposed by E2P.</p></div>
    `;
  }

  const controls = [...(stateEvidence.buttons || []), ...(stateEvidence.inputs || [])].slice(0, 8);
  elements.explorationFacts.innerHTML = `
    <div><dt>Route</dt><dd>${escapeHtml(stateEvidence.path || "/")}</dd></div>
    <div><dt>Headings</dt><dd>${escapeHtml((stateEvidence.headings || []).join(" · ") || "None detected")}</dd></div>
    <div><dt>Visible controls</dt><dd>${escapeHtml(controls.join(" · ") || "No remaining safe controls")}</dd></div>
  `;

  const history = (activity.events || [])
    .filter((event) => event.detail?.type === "exploration" && event.detail.action)
    .slice(-4)
    .reverse();
  elements.explorationHistory.innerHTML = history.length
    ? history.map((event) => `
        <li><span>${escapeHtml(event.detail.action.kind)}</span><p>${escapeHtml(event.detail.action.name)}</p></li>
      `).join("")
    : "<li><span>Waiting</span><p>Completed model actions will appear here.</p></li>";
}

function updateActivityElapsed() {
  const activity = state.activity;
  if (!activity.startedAt) {
    elements.activityElapsed.textContent = "Idle";
    return;
  }

  const endTime = activity.finishedAt ? Date.parse(activity.finishedAt) : Date.now();
  const elapsedMs = Math.max(0, endTime - Date.parse(activity.startedAt));
  const prefix = activity.status === "running" ? "Running" : activity.status === "failed" ? "Stopped" : "Finished";
  elements.activityElapsed.textContent = `${prefix} in ${formatElapsedTime(elapsedMs)}`;
}

function formatElapsedTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

function formatActivityPhase(value) {
  const words = String(value || "activity").replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function createOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `operation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
      ...(state.requestToken ? { "X-E2P-Request-Token": state.requestToken } : {}),
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
