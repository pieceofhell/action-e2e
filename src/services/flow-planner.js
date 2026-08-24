const { normalizeAuthConfig, toPublicAuthMetadata } = require("./auth-config");

function generateFlowPlan(inspection, { authConfig } = {}) {
  const normalizedAuth = normalizeAuthConfig(authConfig || inspection.liveExploration?.access || {});

  if (normalizedAuth.mode === "authenticated") {
    return buildAuthenticatedFlowPlan(inspection, normalizedAuth);
  }

  const flows = [];
  const safeButtons = collectSafeAutomationButtons(inspection);
  const primaryHeading = pickPrimaryHeading(inspection);
  const primaryStatus = pickStatusElement(inspection.uiHints.statusElements);

  flows.push({
    id: "render-main-interface",
    title: "Main interface rendering",
    confidence: confidenceFrom(inspection.detection.confidence, "high"),
    summary: "Verify that the application loads the initial page and exposes the central elements of the expected user experience.",
    sourceSignals: [
      primaryHeading ? `Detected main heading: ${primaryHeading.text}.` : "No explicit main heading was found.",
      `${inspection.uiHints.buttons.length} visible actions were identified during static reading.`,
    ],
    assumptions: [
      "The initial route represents the most relevant system entry point.",
      "The main interface can be validated without mutating persisted data.",
    ],
    criteria: [
      {
        title: "Initial page is loaded",
        given: "the user opens the application",
        when: "the initial route is loaded",
        then: "the main interface becomes visible and the page remains interactive",
      },
      {
        title: "Core elements are visible",
        given: "the initial page has been opened",
        when: "the user observes the application shell",
        then: "the main headings, controls, or interaction surfaces are available",
      },
    ],
    blueprint: {
      kind: "render",
      heading: primaryHeading,
      buttons: safeButtons.slice(0, 3),
      canvas: inspection.uiHints.canvases[0] || null,
    },
  });

  if (safeButtons.length > 0) {
    flows.push({
      id: "review-primary-actions",
      title: "Primary action review",
      confidence: "medium",
      summary: "Verify that the main interface buttons are visible and can be triggered without an immediate visible failure.",
      sourceSignals: safeButtons.slice(0, 3).map((button) => `Detected candidate action: ${button.text || button.id || button.dataTool}.`),
      assumptions: [
        "The selected buttons represent safe actions for an initial smoke test.",
      ],
      criteria: [
        {
          title: "Primary actions are available",
          given: "the initial page has been loaded",
          when: "the user identifies the main actions",
          then: "the central controls are visible and accessible",
        },
        {
          title: "Clicks do not break the interface",
          given: "the main controls are available",
          when: "the user triggers those actions",
          then: "the application remains operational without an immediate visible failure",
        },
      ],
      blueprint: {
        kind: "safe-actions",
        buttons: safeButtons.slice(0, 3),
        statusElement: primaryStatus,
      },
    });
  }

  switch (inspection.detection.appType) {
    case "graphics-canvas":
      flows.push(buildCanvasFlow(inspection, primaryStatus));
      flows.push(buildToolFlow(inspection, primaryStatus));
      break;
    case "authentication":
      flows.push(buildAuthPresenceFlow(inspection));
      flows.push(buildAuthValidationFlow(inspection));
      break;
    case "form-centric":
      flows.push(buildFormFlow(inspection));
      break;
    case "content-navigation":
      flows.push(buildNavigationFlow(inspection));
      break;
    default:
      flows.push(buildGenericExplorationFlow(inspection, primaryStatus));
      break;
  }

  flows.push(...buildLiveExplorationFlows(inspection));

  return {
    mode: "heuristic",
    access: toPublicAuthMetadata(normalizedAuth),
    summary: "Candidate flows and baseline criteria were generated from project signals, with emphasis on safe automation and later semantic refinement by the model.",
    flows: dedupeFlows(flows).slice(0, 8),
  };
}

function buildAuthenticatedFlowPlan(inspection, authConfig) {
  const observedRoutes = inspection.liveExploration?.status === "completed"
    ? inspection.liveExploration.routes || []
    : [];
  const configuredRouteEvidence = authConfig.allowedPaths
    .filter((routePath) => !routePath.endsWith("/*"))
    .map((routePath) => ({ path: routePath, headings: [], title: "" }));
  const routeEvidence = observedRoutes.length
    ? observedRoutes
    : configuredRouteEvidence.length
      ? configuredRouteEvidence
      : [{ path: authConfig.initialPath, headings: [], title: "" }];

  const flows = routeEvidence.slice(0, 5).map((route, index) => {
    const routePath = route.path || authConfig.initialPath;
    const heading = route.headings?.[0] || "";
    const routeLabel = heading || route.title || routePath;

    return {
      id: `authenticated-read-${slugifyFragment(routePath || String(index + 1))}`,
      title: `Authenticated read-only view: ${routeLabel}`,
      confidence: heading ? "high" : observedRoutes.length ? "medium" : "low",
      summary: `Verify that an authenticated user can reach ${routePath} and inspect its interface without changing application data.`,
      accessMode: "authenticated-read-only",
      sourceSignals: [
        heading ? `Live authenticated exploration observed the heading "${heading}".` : `The read-only allowlist includes ${routePath}.`,
        "The session is prepared by a trusted authentication adapter rather than model-generated code.",
      ],
      assumptions: [
        "The configured profile has permission to view this route.",
        "No create, update, publish, send, upload, or delete operation is necessary for this flow.",
      ],
      prohibitedEffects: ["create", "update", "publish", "send", "upload", "delete"],
      criteria: [
        {
          title: "Authenticated route is reachable",
          given: "an isolated authenticated read-only session has been verified",
          when: `the user navigates to ${routePath}`,
          then: "the application renders the protected route instead of returning to the guest entry point",
        },
        {
          title: "Protected content is observable without mutation",
          given: `the protected route ${routePath} is open`,
          when: "the user observes its visible interface",
          then: heading
            ? `the heading "${heading}" is visible and no mutating request is delivered`
            : "the page body is visible and no mutating request is delivered",
        },
      ],
      blueprint: {
        kind: "authenticated-read-only",
        routePath,
        expectedHeading: heading,
      },
    };
  });

  return {
    mode: "authenticated-read-only",
    access: toPublicAuthMetadata(authConfig),
    summary: "Authenticated candidate flows are restricted to approved read-only routes and will be rendered as validated action plans for the trusted executor.",
    flows,
  };
}

function buildCanvasFlow(inspection, primaryStatus) {
  const canvas = inspection.uiHints.canvases[0] || null;
  const firstToolButton = inspection.uiHints.buttons.find((button) => button.dataTool || /point|line|circle|polygon|select|tool|reta|circunfer|pol[ií]gono/i.test(button.text));

  return {
    id: "canvas-surface-interaction",
    title: "Basic interaction with the graphical surface",
    confidence: canvas ? "high" : "medium",
    summary: "Validate whether the main drawing surface can receive user interaction without an immediate failure.",
    sourceSignals: [
      canvas ? "A canvas element was identified in the interface." : "Static reading suggests graphical behavior, but no explicit canvas was found.",
      firstToolButton ? `Detected candidate tool: ${firstToolButton.text || firstToolButton.dataTool}.` : "No explicit graphical tool was found.",
    ],
    assumptions: [
      "An initial click interaction on the canvas is sufficient for a safe smoke test.",
    ],
    criteria: [
      {
        title: "Graphical surface is available",
        given: "the application has been opened",
        when: "the user reaches the main drawing area",
        then: "the graphical surface is visible and ready for interaction",
      },
      {
        title: "Initial interaction does not break the app",
        given: "a graphical tool has been selected",
        when: "the user interacts with the drawing surface",
        then: "the application stays stable and the supporting interface remains accessible",
      },
    ],
    blueprint: {
      kind: "canvas-smoke",
      canvas,
      toolButton: firstToolButton || null,
      statusElement: primaryStatus,
    },
  };
}

function buildToolFlow(inspection, primaryStatus) {
  const toolButtons = inspection.uiHints.buttons.filter((button) => button.dataTool || /point|line|circle|polygon|select|tool|reta|circunfer|pol[ií]gono|sele/i.test(button.text));
  const toolLabel = inspection.uiHints.statusElements.find((item) => /toollabel|tool/i.test(item.label));

  return {
    id: "tool-selection-flow",
    title: "Primary tool switching",
    confidence: toolButtons.length >= 2 ? "high" : "medium",
    summary: "Verify whether the user can switch between the main tools or modes of the application.",
    sourceSignals: [
      `${toolButtons.length} candidate tool-switch buttons were identified.`,
      toolLabel ? `Detected tool-status element: ${toolLabel.label}.` : "No explicit tool label was found.",
    ],
    assumptions: [
      "Switching tools represents a central journey for the expected user.",
    ],
    criteria: [
      {
        title: "Tools are visible",
        given: "the user is on the main screen",
        when: "they inspect the toolbar",
        then: "the main interaction options are available",
      },
      {
        title: "Context can be changed",
        given: "the tools are available",
        when: "the user switches between different modes",
        then: "the application reflects the change without an immediate error",
      },
    ],
    blueprint: {
      kind: "tool-switch",
      toolButtons: toolButtons.slice(0, 3),
      toolLabel: toolLabel || primaryStatus || null,
    },
  };
}

function buildAuthPresenceFlow(inspection) {
  const inputs = inspection.uiHints.inputs.slice(0, 3);
  const submitButton = inspection.uiHints.buttons.find((button) => /login|sign in|access|submit|entrar|acessar/i.test(button.text)) || inspection.uiHints.buttons[0] || null;

  return {
    id: "auth-screen-presence",
    title: "Authentication screen presence",
    confidence: inputs.length >= 2 ? "high" : "medium",
    summary: "Confirm that the primary authentication fields and actions are available to the user.",
    sourceSignals: [
      `${inputs.length} authentication-related fields were detected.`,
      submitButton ? `Detected primary candidate action: ${submitButton.text}.` : "No primary authentication button was inferred.",
    ],
    assumptions: [
      "The initial route exposes the main authentication entry point.",
    ],
    criteria: [
      {
        title: "Essential fields are visible",
        given: "the user opens the application",
        when: "the initial screen is loaded",
        then: "the central authentication fields are accessible",
      },
      {
        title: "Primary action is available",
        given: "the fields are visible",
        when: "the user identifies the main action",
        then: "the authentication control is ready to be used",
      },
    ],
    blueprint: {
      kind: "auth-presence",
      inputs,
      submitButton,
    },
  };
}

function buildAuthValidationFlow(inspection) {
  const requiredInputs = inspection.uiHints.inputs.filter((input) => input.required);
  const submitButton = inspection.uiHints.buttons.find((button) => /login|sign in|access|submit|entrar|acessar/i.test(button.text)) || inspection.uiHints.buttons[0] || null;

  return {
    id: "auth-validation-flow",
    title: "Basic authentication-flow validation",
    confidence: requiredInputs.length ? "high" : "medium",
    summary: "Safely validate whether the form reacts to an initial submission attempt with insufficient data.",
    sourceSignals: [
      `${requiredInputs.length} fields marked as required were detected.`,
      submitButton ? `Detected candidate submit button: ${submitButton.text}.` : "The submit control will require manual review.",
    ],
    assumptions: [
      "The test must not perform a real authentication flow or mutate persisted data.",
    ],
    criteria: [
      {
        title: "Controlled initial submission",
        given: "the user is on the authentication form",
        when: "an initial submission is attempted without complete data",
        then: "the interface reacts without collapsing and keeps the flow visible",
      },
    ],
    blueprint: {
      kind: "form-validation",
      inputs: inspection.uiHints.inputs.slice(0, 3),
      submitButton,
      requiredInputs,
    },
  };
}

function buildFormFlow(inspection) {
  const primaryForm = inspection.uiHints.forms[0] || null;
  const submitButton = inspection.uiHints.buttons.find((button) => /submit|send|save|continue|next|enviar|salvar|continuar|prosseguir/i.test(button.text)) || inspection.uiHints.buttons[0] || null;

  return {
    id: "primary-form-review",
    title: "Primary form review",
    confidence: primaryForm ? "high" : "medium",
    summary: "Verify that the main form of the system appears and accepts an initial fill attempt.",
    sourceSignals: [
      primaryForm ? "Primary form detected." : "No explicit form was found; the flow will be treated as a hypothesis.",
      `${inspection.uiHints.inputs.length} input fields were read from the interface.`,
    ],
    assumptions: [
      "The primary form can be exercised without permanently persisting data.",
    ],
    criteria: [
      {
        title: "Form is accessible",
        given: "the user reaches the main screen",
        when: "they navigate to the central form",
        then: "the fields and main action are available",
      },
      {
        title: "Initial fill is viable",
        given: "the fields are visible",
        when: "the user performs a safe initial fill attempt",
        then: "the interface responds without an immediate visible failure",
      },
    ],
    blueprint: {
      kind: "form-validation",
      inputs: inspection.uiHints.inputs.slice(0, 4),
      submitButton,
      requiredInputs: inspection.uiHints.inputs.filter((input) => input.required),
    },
  };
}

function buildNavigationFlow(inspection) {
  const internalLinks = inspection.uiHints.links.filter((link) => link.href && !/^https?:\/\//i.test(link.href) && !link.href.startsWith("#"));

  return {
    id: "primary-navigation-flow",
    title: "Primary navigation paths",
    confidence: internalLinks.length ? "high" : "medium",
    summary: "Verify whether the main internal navigation paths can be traversed by the expected user.",
    sourceSignals: [
      `${internalLinks.length} internal links were identified as navigation candidates.`,
    ],
    assumptions: [
      "The detected internal links represent safe paths for an initial smoke test.",
    ],
    criteria: [
      {
        title: "Primary navigation is available",
        given: "the user has reached the initial page",
        when: "they use the primary navigation",
        then: "the most relevant internal paths can be reached",
      },
    ],
    blueprint: {
      kind: "navigation",
      links: internalLinks.slice(0, 2),
    },
  };
}

function buildGenericExplorationFlow(inspection, primaryStatus) {
  return {
    id: "generic-safe-exploration",
    title: "Safe interface exploration",
    confidence: "low",
    summary: "Propose a conservative smoke test when the project still exposes only a small amount of explicit semantic signal.",
    sourceSignals: [
      "The project was classified as a generic web application.",
      `Found ${inspection.uiHints.buttons.length} actions and ${inspection.uiHints.links.length} useful links for safe exploration.`,
    ],
    assumptions: [
      "The real semantics of the flow still require human validation.",
    ],
    criteria: [
      {
        title: "Interface remains available",
        given: "the application has been opened",
        when: "the user interacts with a small set of safe controls",
        then: "the page remains functional and visible",
      },
    ],
    blueprint: {
      kind: "safe-actions",
      buttons: collectSafeAutomationButtons(inspection).slice(0, 2),
      statusElement: primaryStatus,
    },
  };
}

function buildLiveExplorationFlows(inspection) {
  const liveRoutes = inspection.liveExploration?.status === "completed"
    ? inspection.liveExploration.routes || []
    : [];

  if (!liveRoutes.length) {
    return [];
  }

  const flows = [];
  const additionalRoutes = liveRoutes.slice(1, 4);

  for (const route of additionalRoutes) {
    const routeLabel = route.title || route.path || "observed route";
    const routeSlug = slugifyFragment(route.path || route.title || String(flows.length + 1));
    const firstHeading = route.headings?.[0] || "";

    flows.push({
      id: `live-route-${routeSlug}`,
      title: `Reach ${routeLabel}`,
      confidence: firstHeading ? "high" : "medium",
      summary: `Validate that the user can reach ${routeLabel} and that the route renders a distinct interface state.`,
      sourceSignals: [
        `Live exploration visited ${route.path || route.url}.`,
        firstHeading ? `Observed heading on that route: ${firstHeading}.` : "The route did not expose a strong heading signal.",
        `${(route.buttons || []).length} visible button(s) and ${(route.inputs || []).length} visible input(s) were observed there.`,
      ],
      assumptions: [
        "The observed route can be revisited safely from a smoke-test perspective.",
      ],
      criteria: [
        {
          title: "Observed route is reachable",
          given: "the user starts from the initial entry point",
          when: `they navigate to ${routeLabel}`,
          then: "the route loads successfully and exposes its own visible interface context",
        },
        {
          title: "Route-specific UI is present",
          given: `${routeLabel} has been opened`,
          when: "the user inspects the route",
          then: firstHeading ? `the interface exposes the observed heading "${firstHeading}" or equivalent route-specific evidence` : "the route presents route-specific elements that differentiate it from the home screen",
        },
      ],
      blueprint: {
        kind: "live-route",
        routePath: route.path,
        expectedHeading: firstHeading,
      },
    });

    if ((route.inputs || []).length > 0 || route.formsCount > 0) {
      flows.push(buildLiveFormFlow(route, routeSlug));
    }
  }

  return flows;
}

function buildLiveFormFlow(route, routeSlug) {
  const routeLabel = route.title || route.path || "observed route";
  const inputHints = (route.inputs || []).slice(0, 3).map((input) => input.label || input.placeholder || input.name || input.type).filter(Boolean);
  const actionHints = (route.buttons || []).slice(0, 2).map((button) => button.text || button.id || button.dataTestId).filter(Boolean);

  return {
    id: `live-form-${routeSlug}`,
    title: `Review interactive fields on ${routeLabel}`,
    confidence: route.formsCount > 0 ? "high" : "medium",
    summary: `Use the live interface evidence to verify that the interactive fields on ${routeLabel} can be approached safely by the expected user.`,
    sourceSignals: [
      `${route.formsCount || 0} form(s) and ${(route.inputs || []).length} input(s) were observed on ${route.path || route.url}.`,
      inputHints.length ? `Observed field hints: ${inputHints.join(", ")}.` : "The route exposes generic interactive fields without strong textual hints.",
      actionHints.length ? `Observed safe action hints: ${actionHints.join(", ")}.` : "No obvious submit action was observed on the route.",
    ],
    assumptions: [
      "The route can be exercised with non-destructive sample data or validation-only interaction.",
    ],
    criteria: [
      {
        title: "Interactive fields are available",
        given: `the user reaches ${routeLabel}`,
        when: "they inspect the visible interactive controls",
        then: "the route exposes the expected input surface and keeps the interaction available",
      },
      {
        title: "Safe interaction is possible",
        given: "the visible input controls are present",
        when: "the user performs a cautious initial interaction",
        then: "the interface remains stable and presents validation or continuation feedback without collapsing",
      },
    ],
    blueprint: {
      kind: "live-form",
      routePath: route.path,
      expectedHeading: route.headings?.[0] || "",
      inputs: (route.inputs || []).slice(0, 3),
      actionHints,
    },
  };
}

function dedupeFlows(flows) {
  const output = [];
  const seen = new Set();

  for (const flow of flows.filter(Boolean)) {
    if (seen.has(flow.id)) {
      continue;
    }

    seen.add(flow.id);
    output.push(flow);
  }

  return output;
}

function slugifyFragment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "route";
}

function isDestructive(text) {
  return /delete|remove|clear|logout|sign out|discard|destroy|sair|limpar|apagar|excluir|reset/i.test(text || "");
}

function isSafeAutomationButton(button) {
  const label = button?.text || button?.id || button?.dataTool || "";
  return Boolean(label) && !isDestructive(label) && !isRiskyAutomationAction(label);
}

function isRiskyAutomationAction(text) {
  return /\b(browse|choose|folder|file|upload|import|download|load|login|log in|sign in|checkout|pay|purchase|submit|save)\b/i.test(text || "");
}

function pickStatusElement(statusElements) {
  return statusElements.find((item) => /status|summary|message|feedback|result/i.test(item.label)) || statusElements[0] || null;
}

function pickPrimaryHeading(inspection) {
  const liveHeading = inspection.liveExploration?.status === "completed"
    ? inspection.liveExploration.routes?.[0]?.headings?.[0]
    : "";

  if (liveHeading) {
    return {
      text: liveHeading,
      level: "h1",
      filePath: "live-exploration",
      target: { strategy: "text", value: liveHeading },
    };
  }

  return inspection.uiHints.headings[0] || null;
}

function collectSafeAutomationButtons(inspection) {
  const staticButtons = inspection.uiHints.buttons || [];
  const liveButtons = inspection.liveExploration?.status === "completed"
    ? (inspection.liveExploration.routes?.[0]?.buttons || []).map((button) => {
        const text = button.text || button.id || button.dataTestId || "";
        const accessibleName = button.ariaLabel || text;
        return {
          text,
          ariaLabel: button.ariaLabel || "",
          id: button.id || null,
          dataTool: button.dataTestId || null,
          target: button.id
            ? { strategy: "id", value: button.id }
            : accessibleName
              ? { strategy: "roleText", role: "button", value: accessibleName }
              : null,
        };
      })
    : [];

  const merged = [...liveButtons, ...staticButtons].filter((button) => button?.target && isSafeAutomationButton(button));
  const output = [];
  const seen = new Set();

  for (const button of merged) {
    const key = `${button.ariaLabel || button.text || ""}|${button.id || ""}|${button.dataTool || ""}`;
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(button);
  }

  return output;
}

function confidenceFrom(detectionConfidence, preferred) {
  if (preferred === "high" && detectionConfidence !== "low") {
    return detectionConfidence === "high" ? "high" : "medium";
  }

  return preferred;
}

module.exports = {
  generateFlowPlan,
};
