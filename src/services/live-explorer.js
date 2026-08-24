const { chromium } = require("playwright");
const { classifyExplorationAction, runAgenticExploration } = require("./agentic-explorer");
const { discoverPotentialBugs } = require("./bug-discovery");
const { normalizeAuthConfig, redactSecrets, toPublicAuthMetadata } = require("./auth-config");
const { createAuthenticatedSession } = require("./auth-session");
const { supportsVisionInput } = require("./llm-provider");
const {
  maybeInstallTargetProject,
  normalizeRuntimeConfig,
  startTargetRuntime,
} = require("./runtime-orchestrator");

async function exploreLiveProject({
  projectPath,
  inspection,
  runtimeConfig,
  aiConfig,
  authConfig,
  artifactRun = null,
  onProgress = () => {},
}) {
  onProgress({ phase: "runtime-configuration", message: "Checking the inferred start command and base URL...", progress: 8 });
  const normalizedRuntime = normalizeRuntimeConfig(inspection.runtime, runtimeConfig);
  const normalizedAuth = normalizeAuthConfig(authConfig);

  if (normalizedRuntime.mode === "manual") {
    return {
      attempted: false,
      status: "unsupported",
      mode: normalizedRuntime.mode,
      baseUrl: normalizedRuntime.baseUrl || "",
      routes: [],
      summary: buildEmptySummary(),
      warnings: [
        "Live exploration is unavailable while the runtime mode is set to analysis-only.",
      ],
      access: toPublicAuthMetadata(normalizedAuth),
      generatedAt: new Date().toISOString(),
    };
  }

  let runtimeHandle = null;
  let browser = null;
  let context = null;
  let authSession = null;
  let agenticExploration = null;
  let diagnosticsCollector = null;
  let bugDiscovery = null;
  let visionEnabled = false;

  try {
    onProgress({ phase: "dependency-check", message: normalizedRuntime.runInstallBeforeExecution
      ? "Installing the target project's declared dependencies..."
      : "Using the target project's existing dependencies...", progress: 15 });
    await maybeInstallTargetProject({
      targetProjectPath: projectPath,
      runtimeConfig: normalizedRuntime,
      label: "Target project installation before live exploration",
    });

    onProgress({ phase: "target-startup", message: "Starting the application under analysis and waiting for its URL...", progress: 25 });
    runtimeHandle = await startTargetRuntime({
      targetProjectPath: projectPath,
      runtimeConfig: normalizedRuntime,
    });

    onProgress({ phase: "browser-startup", message: "Target is reachable; launching an isolated browser...", progress: 46 });
    browser = await chromium.launch({
      headless: true,
    });
    if (normalizedAuth.mode === "authenticated") {
      onProgress({ phase: "authenticated-session", message: "Preparing the configured read-only authenticated session...", progress: 54 });
      authSession = await createAuthenticatedSession({
        browser,
        baseUrl: runtimeHandle.baseUrl,
        authConfig: normalizedAuth,
      });
      context = authSession.context;
    } else {
      context = await browser.newContext({
        baseURL: runtimeHandle.baseUrl,
        viewport: {
          width: 1180,
          height: 760,
        },
      });
    }

    await installReadOnlyNetworkGuard(context);
    diagnosticsCollector = createRuntimeDiagnosticsCollector(context, authSession?.secretValues || []);
    visionEnabled = normalizedAuth.mode !== "authenticated"
      && await supportsVisionInput(aiConfig);

    const routes = [];
    const warnings = [];
    const visited = new Set();

    const initialPage = await context.newPage();
    const initialTarget = normalizedAuth.mode === "authenticated"
      ? new URL(normalizedAuth.initialPath, runtimeHandle.baseUrl).toString()
      : runtimeHandle.baseUrl;
    onProgress({ phase: "first-route", message: "Opening the initial route and observing its visible interface...", progress: 63 });
    const homeObservation = await observePage({
      page: initialPage,
      targetUrl: initialTarget,
      baseUrl: runtimeHandle.baseUrl,
    });
    if (authSession) {
      await authSession.verifyPage(initialPage);
    }
    routes.push(homeObservation);
    visited.add(homeObservation.path || "/");
    onProgress({ phase: "route-discovery", message: `Captured the initial route with ${homeObservation.buttons?.length || 0} action(s) and ${homeObservation.inputs?.length || 0} input(s).`, progress: 74 });

    agenticExploration = await runAgenticExploration({
      page: initialPage,
      initialObservation: homeObservation,
      aiConfig,
      observeCurrentPage: (page) => capturePageObservation({
        page,
        baseUrl: runtimeHandle.baseUrl,
        authenticated: normalizedAuth.mode === "authenticated",
      }),
      onProgress,
      allowVisualPreview: normalizedAuth.mode !== "authenticated",
      visionEnabled,
      evidenceDirectory: artifactRun?.evidenceDirectory || "",
      artifactBaseUrl: artifactRun?.artifactBaseUrl
        ? `${artifactRun.artifactBaseUrl}/artifacts/exploration`
        : "",
    });
    if (agenticExploration.status !== "completed") {
      throw new Error(agenticExploration.error || "The selected model did not complete a useful live interface exploration.");
    }

    const safeLinks = normalizedAuth.mode === "authenticated"
      ? normalizedAuth.allowedPaths
          .filter((candidate) => !candidate.endsWith("/*"))
          .map((candidate) => ({ text: candidate, href: new URL(candidate, runtimeHandle.baseUrl).toString() }))
      : pickSafeLinks(homeObservation.links, runtimeHandle.baseUrl);

    const linksToInspect = safeLinks.slice(0, 2);
    for (const [index, link] of linksToInspect.entries()) {
      try {
        const resolvedUrl = resolveTargetUrl(link.href, runtimeHandle.baseUrl);
        const resolvedPath = pathFromUrl(resolvedUrl);

        if (!resolvedUrl || visited.has(resolvedPath)) {
          continue;
        }

        onProgress({
          phase: "linked-route",
          message: `Inspecting linked route ${index + 1} of ${linksToInspect.length}...`,
          progress: 76 + Math.round(((index + 1) / Math.max(linksToInspect.length, 1)) * 10),
        });
        const page = await context.newPage();
        const observation = await observePage({
          page,
          targetUrl: resolvedUrl,
          baseUrl: runtimeHandle.baseUrl,
        });
        await page.close();

        if (!visited.has(observation.path)) {
          routes.push(observation);
          visited.add(observation.path);
        }
      } catch (error) {
        throw new Error(`Linked-route exploration failed: ${error.message}`);
      }
    }

    const runtimeErrors = uniqueStrings(routes.flatMap((route) => route.runtimeErrors || [])).slice(0, 6);
    if (runtimeErrors.length) {
      warnings.push(`The rendered application exposed ${runtimeErrors.length} development runtime error(s); they were retained as defect evidence.`);
    }

    const diagnostics = diagnosticsCollector.snapshot();
    if (normalizedAuth.mode === "authenticated") {
      bugDiscovery = {
        status: "unavailable",
        mode: "blind-model-guided",
        evidenceMode: "disabled-for-authenticated-session",
        summary: "Exploratory bug discovery is disabled for authenticated sessions because visual artifacts are intentionally suppressed.",
        hypotheses: [],
        limitations: ["Run guest exploration to use persisted visual defect evidence."],
        errors: [],
        generatedAt: new Date().toISOString(),
      };
    } else {
      bugDiscovery = await discoverPotentialBugs({
        inspection,
        exploration: agenticExploration,
        diagnostics,
        aiConfig,
        evidenceDirectory: artifactRun?.evidenceDirectory || "",
        visionEnabled,
        onProgress,
      });
      if (bugDiscovery.status === "failed") {
        throw new Error(`Exploratory defect discovery failed: ${bugDiscovery.errors?.[0] || bugDiscovery.summary}`);
      }
    }

    onProgress({ phase: "exploration-summary", message: `Summarizing evidence from ${routes.length} observed route(s) and ${bugDiscovery.hypotheses?.length || 0} potential defect(s)...`, progress: 96 });

    return {
      attempted: true,
      status: "completed",
      health: runtimeErrors.length ? "degraded" : "healthy",
      mode: runtimeHandle.mode,
      baseUrl: runtimeHandle.baseUrl,
      startCommand: runtimeHandle.startCommand || "",
      routes,
      summary: summarizeRoutes(routes, agenticExploration),
      agenticExploration,
      bugDiscovery,
      diagnostics,
      visionEnabled,
      artifactRun: artifactRun ? toPublicArtifactRun(artifactRun) : null,
      runtimeErrors,
      warnings,
      access: authSession
        ? {
            ...authSession.metadata,
            status: "verified",
            policy: authSession.policy.getSummary(),
          }
        : toPublicAuthMetadata(normalizedAuth),
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    const secretValues = authSession?.secretValues || [];
    return {
      attempted: true,
      status: "failed",
      mode: normalizedRuntime.mode,
      baseUrl: normalizedRuntime.baseUrl && normalizedRuntime.baseUrl !== "auto" ? normalizedRuntime.baseUrl : "",
      routes: [],
      summary: buildEmptySummary(),
      agenticExploration,
      bugDiscovery,
      diagnostics: diagnosticsCollector?.snapshot() || buildEmptyDiagnostics(),
      visionEnabled,
      artifactRun: artifactRun ? toPublicArtifactRun(artifactRun) : null,
      warnings: [],
      error: redactSecrets(error.message, secretValues),
      access: {
        ...toPublicAuthMetadata(normalizedAuth),
        status: normalizedAuth.mode === "authenticated" ? "failed" : "not-applicable",
      },
      generatedAt: new Date().toISOString(),
    };
  } finally {
    if (authSession) {
      await authSession.dispose().catch(() => {});
    } else if (context) {
      await context.close().catch(() => {});
    }

    if (browser) {
      await browser.close().catch(() => {});
    }

    if (runtimeHandle?.stop) {
      await runtimeHandle.stop().catch(() => {});
    }
  }
}

function mergeLiveExplorationIntoInspection({
  inspection,
  liveExploration,
}) {
  const signals = [...(inspection.signals || [])];
  const warnings = [...(inspection.warnings || [])];

  if (liveExploration?.status === "completed") {
    signals.unshift(
      `Live exploration reached ${liveExploration.routes.length} route(s) at ${liveExploration.baseUrl}.`,
      `${liveExploration.summary.uniqueHeadings.length} visible heading(s) and ${liveExploration.summary.uniqueButtons.length} visible action(s) were observed in the rendered UI.`
    );
    signals.unshift(
      `${liveExploration.bugDiscovery?.hypotheses?.length || 0} evidence-grounded potential defect(s) were retained for human validation.`
    );
  }

  if (Array.isArray(liveExploration?.warnings) && liveExploration.warnings.length > 0) {
    warnings.push(...liveExploration.warnings);
  }

  if (liveExploration?.status === "failed" && liveExploration.error) {
    warnings.push(`Live exploration failed: ${liveExploration.error}`);
  }

  if (liveExploration?.status === "unsupported") {
    warnings.push(...(liveExploration.warnings || []));
  }

  return {
    ...inspection,
    liveExploration,
    signals: uniqueStrings(signals).slice(0, 16),
    warnings: uniqueStrings(warnings).slice(0, 12),
  };
}

async function observePage({ page, targetUrl, baseUrl }) {
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForTimeout(700);

  return capturePageObservation({ page, baseUrl });
}

async function capturePageObservation({ page, baseUrl, authenticated = false }) {
  const observation = await page.evaluate(() => {
    function normalizeText(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function isVisible(element) {
      if (!element) {
        return false;
      }

      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && style.opacity !== "0"
        && style.pointerEvents !== "none"
        && rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.right > 0;
    }

    function uniqueObjects(items, keyFn, limit) {
      const output = [];
      const seen = new Set();

      for (const item of items) {
        const key = keyFn(item);
        if (!key || seen.has(key)) {
          continue;
        }

        seen.add(key);
        output.push(item);

        if (output.length >= limit) {
          break;
        }
      }

      return output;
    }

    function inputLabel(element) {
      const ariaLabel = normalizeText(element.getAttribute("aria-label"));
      if (ariaLabel) {
        return ariaLabel;
      }

      const id = element.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        const labelText = normalizeText(label?.textContent || "");
        if (labelText) {
          return labelText;
        }
      }

      const parentLabel = element.closest("label");
      return normalizeText(parentLabel?.textContent || "");
    }

    function accessibleName(element) {
      return normalizeText(
        element.getAttribute("aria-label")
        || element.getAttribute("title")
        || element.innerText
        || element.textContent
        || element.value
        || element.querySelector("img[alt]")?.getAttribute("alt")
        || element.getAttribute("placeholder")
        || element.getAttribute("name")
        || ""
      );
    }

    function isInActiveOverlay(element) {
      return Boolean(element.closest("dialog, [role='dialog'], [aria-modal='true'], .modal, [class*='modal'], [class*='drawer']"));
    }

    function nearestActionContext(element, baseName) {
      if (!/\b(add|remove|save|favorite|favourite|cart|item)\b/i.test(baseName)) return "";
      const container = element.closest([
        "article",
        "li",
        "[data-product]",
        "[data-item]",
        "[class*='product-card']",
        "[class*='productCard']",
        "[class*='item-card']",
        "[class*='itemCard']",
      ].join(", "));
      if (!container) return "";
      const heading = container.querySelector("h1, h2, h3, h4, [role='heading']");
      const context = normalizeText(heading?.innerText || heading?.textContent || "");
      if (context && !baseName.toLowerCase().includes(context.toLowerCase())) {
        return context.slice(0, 140);
      }
      return "";
    }

    function stableActionId(material) {
      let hash = 2166136261;
      for (let index = 0; index < material.length; index += 1) {
        hash ^= material.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return `e2p-${(hash >>> 0).toString(36)}`;
    }

    document.querySelectorAll("[data-e2p-action-id]").forEach((element) => {
      element.removeAttribute("data-e2p-action-id");
    });

    const semanticElements = Array.from(document.querySelectorAll(
      "button, [role='button'], a[href], input, textarea, select"
    )).filter((element) => isVisible(element) && !element.disabled);
    const semanticSet = new Set(semanticElements);
    const pointerInfo = new Map();
    function visitCssRules(rules) {
      for (const rule of Array.from(rules || [])) {
        if (rule.cssRules) visitCssRules(rule.cssRules);
        if (!rule.selectorText || !rule.style?.cursor || !/\b(pointer|default)\b/i.test(rule.style.cursor)) continue;
        for (const selector of rule.selectorText.split(",")) {
          const baseSelector = selector.replace(/:hover|:active|:focus-visible|:focus/g, "").trim();
          if (!baseSelector) continue;
          try {
            for (const element of document.querySelectorAll(baseSelector)) {
              pointerInfo.set(element, { cursor: rule.style.cursor.toLowerCase(), selector: baseSelector });
            }
          } catch {}
        }
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try { visitCssRules(sheet.cssRules); } catch {}
    }
    const visualPointerElements = [...pointerInfo.entries()]
      .filter(([element, info]) => info.cursor === "pointer" && isVisible(element) && !semanticSet.has(element))
      .map(([element]) => element);
    const interactiveElements = [...semanticElements, ...visualPointerElements]
      .sort((left, right) => Number(isInActiveOverlay(right)) - Number(isInActiveOverlay(left)));

    const actionIdOccurrences = new Map();
    const actions = interactiveElements.slice(0, 60).flatMap((element) => {
      const tag = element.tagName.toLowerCase();
      const inputType = normalizeText(element.getAttribute("type") || (tag === "input" || tag === "textarea" ? "text" : tag));
      const visualInfo = semanticSet.has(element) ? null : pointerInfo.get(element);
      const visualClass = normalizeText(String(element.className || "").replace(/\b(selected|active|occupied|disabled)\b/gi, " ")) || tag;
      const visualIndex = visualInfo
        ? Array.from(document.querySelectorAll(visualInfo.selector)).indexOf(element)
        : -1;
      const semanticInputName = tag === "input" || tag === "textarea" || tag === "select"
        ? inputLabel(element) || normalizeText(element.getAttribute("placeholder") || element.getAttribute("name") || "")
        : "";
      const baseActionName = semanticInputName || accessibleName(element) || `Interactive ${visualClass} ${visualIndex + 1}`;
      const actionContext = nearestActionContext(element, baseActionName);
      const actionName = actionContext ? `${baseActionName} — ${actionContext}` : baseActionName;
      const declaredMinLength = (tag === "input" || tag === "textarea") && Number.isInteger(element.minLength)
        ? element.minLength
        : -1;
      const boundaryProbe = (tag === "input" || tag === "textarea")
        && ["text", "search"].includes(inputType)
        && declaredMinLength < 2
        && /\b(new|add|create|task|todo|item|name|title|message|comment)\b/i.test(actionName)
        && !/\b(search|filter|find)\b/i.test(actionName);
      const semanticRole = tag === "a"
        ? "link"
        : (tag === "input" || tag === "textarea" || tag === "select" ? "input" : "button");
      const accessiblePeers = visualInfo ? [] : semanticElements.filter((candidate) => {
        const candidateTag = candidate.tagName.toLowerCase();
        const candidateRole = candidateTag === "a"
          ? "link"
          : (candidateTag === "input" || candidateTag === "textarea" || candidateTag === "select" ? "input" : "button");
        if (candidateRole !== semanticRole) return false;
        const candidateInputName = candidateRole === "input"
          ? inputLabel(candidate) || normalizeText(candidate.getAttribute("placeholder") || candidate.getAttribute("name") || "")
          : "";
        const candidateBaseName = candidateInputName || accessibleName(candidate);
        const candidateContext = nearestActionContext(candidate, candidateBaseName);
        const candidateName = candidateContext ? `${candidateBaseName} — ${candidateContext}` : candidateBaseName;
        return candidateName === actionName;
      });
      const idBase = stableActionId(`${tag}|${actionName}|${element.getAttribute("href") || ""}|${element.getAttribute("placeholder") || ""}`);
      const occurrence = actionIdOccurrences.get(idBase) || 0;
      actionIdOccurrences.set(idBase, occurrence + 1);
      const id = occurrence ? `${idBase}-${occurrence + 1}` : idBase;
      element.setAttribute("data-e2p-action-id", id);
      const primaryAction = {
        id,
        locatorId: id,
        kind: tag === "select" ? "select" : (tag === "input" || tag === "textarea" ? "fill" : "click"),
        role: visualInfo ? "visual" : semanticRole,
        name: actionName,
        context: actionContext,
        label: tag === "input" || tag === "textarea" || tag === "select" ? inputLabel(element) : "",
        testId: normalizeText(element.getAttribute("data-testid") || ""),
        domId: normalizeText(element.getAttribute("id") || ""),
        placeholder: normalizeText(element.getAttribute("placeholder") || ""),
        inputType,
        minLength: declaredMinLength,
        boundaryProbe,
        options: tag === "select"
          ? Array.from(element.options || []).map((option) => ({
              label: normalizeText(option.textContent || option.label || ""),
              value: normalizeText(option.value || ""),
              selected: Boolean(option.selected),
            })).filter((option) => option.label || option.value).slice(0, 20)
          : [],
        href: tag === "a" ? normalizeText(element.href || element.getAttribute("href") || "") : "",
        targetBlank: tag === "a" && element.getAttribute("target") === "_blank",
        visualSelector: visualInfo?.selector || "",
        visualIndex,
        accessibleIndex: visualInfo ? -1 : accessiblePeers.indexOf(element),
        accessibleCount: accessiblePeers.length,
        inOverlay: isInActiveOverlay(element),
      };
      if ((tag === "input" || tag === "textarea") && ["text", "search"].includes(inputType)) {
        return [primaryAction, {
          ...primaryAction,
          id: `${id}-enter`,
          locatorId: id,
          kind: "press",
          name: `Press Enter in ${primaryAction.label || primaryAction.placeholder || actionName}`,
        }];
      }
      return [primaryAction];
    }).filter((action) => action.name);

    const headings = uniqueObjects(
      Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"))
        .filter(isVisible)
        .map((element) => normalizeText(element.innerText || element.textContent))
        .filter(Boolean),
      (item) => item,
      8
    );

    const buttons = uniqueObjects(
      Array.from(document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a[role='button']"))
        .filter(isVisible)
        .sort((left, right) => Number(isInActiveOverlay(right)) - Number(isInActiveOverlay(left)))
        .map((element) => ({
          text: accessibleName(element),
          ariaLabel: normalizeText(element.getAttribute("aria-label") || ""),
          id: normalizeText(element.getAttribute("id") || ""),
          dataTestId: normalizeText(element.getAttribute("data-testid") || ""),
        }))
        .filter((item) => item.text || item.ariaLabel || item.id || item.dataTestId),
      (item) => item.dataTestId || item.id || item.ariaLabel || item.text,
      24
    );

    const links = uniqueObjects(
      Array.from(document.querySelectorAll("a[href]"))
        .filter(isVisible)
        .map((element) => ({
          text: normalizeText(element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || ""),
          href: normalizeText(element.getAttribute("href") || ""),
        }))
        .filter((item) => item.href),
      (item) => item.href,
      12
    );

    const inputs = uniqueObjects(
      Array.from(document.querySelectorAll("input, textarea, select"))
        .filter(isVisible)
        .map((element) => {
          const type = normalizeText(element.getAttribute("type") || element.tagName.toLowerCase());
          const label = inputLabel(element);
          const placeholder = normalizeText(element.getAttribute("placeholder") || "");
          const name = normalizeText(element.getAttribute("name") || "");
          const canExposeValue = ["text", "search", "textarea"].includes(type)
            && !/password|email|phone|address|credential|token|secret|api\s*key|access\s*key|chave|senha|e-mail/i.test(`${label} ${placeholder} ${name}`);
          return {
            label,
            placeholder,
            name,
            type,
            value: canExposeValue ? normalizeText(element.value || "").slice(0, 160) : "",
          };
        }),
      (item) => `${item.label}|${item.placeholder}|${item.name}|${item.type}`,
      10
    );

    const textContainer = document.querySelector("main") || document.body;
    const overlaySelector = "dialog, [role='dialog'], [aria-modal='true'], .modal, [class*='modal'], [class*='drawer']";
    const activeOverlays = Array.from(document.querySelectorAll(overlaySelector))
      .filter(isVisible)
      .filter((element) => !element.parentElement?.closest(overlaySelector));
    const overlayTexts = uniqueObjects(
      activeOverlays.map((element) => normalizeText(element.innerText || "")).filter(Boolean),
      (item) => item,
      4
    );
    const visibleTextExcerpt = normalizeText(`${overlayTexts.join(" ")} ${textContainer?.innerText || ""}`).slice(0, 2200);
    const runtimeErrors = Array.from(document.querySelectorAll(
      "vite-error-overlay, [data-vite-error-overlay], #webpack-dev-server-client-overlay"
    ))
      .map((element) => normalizeText(element.shadowRoot?.textContent || element.textContent || "Runtime error overlay detected."))
      .filter(Boolean)
      .slice(0, 3)
      .map((message) => message.slice(0, 600));

    return {
      title: normalizeText(document.title || ""),
      url: window.location.href,
      path: `${window.location.pathname}${window.location.search}`,
      headings,
      buttons,
      links,
      inputs,
      formsCount: document.querySelectorAll("form").length,
      dialogsCount: activeOverlays.length,
      overlayTexts,
      canvasesCount: document.querySelectorAll("canvas").length,
      visibleTextExcerpt,
      runtimeErrors,
      actions,
    };
  });

  const origin = new URL(baseUrl).origin;
  observation.actions = (observation.actions || []).map((action) => {
    const sameOrigin = !action.href || (() => {
      try {
        return new URL(action.href, baseUrl).origin === origin;
      } catch (error) {
        return false;
      }
    })();
    const safety = classifyExplorationAction({ ...action, sameOrigin }, { authenticated });
    return { ...action, sameOrigin, ...safety };
  });

  return {
    ...observation,
    url: observation.url || page.url(),
    path: observation.path || pathFromUrl(page.url()),
    baseUrl,
  };
}

async function installReadOnlyNetworkGuard(browserScope) {
  await browserScope.route("**/*", async (route) => {
    const method = route.request().method().toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
}

function pickSafeLinks(links, baseUrl) {
  const safeLinks = [];

  for (const link of links || []) {
    const href = resolveTargetUrl(link.href, baseUrl);
    if (!href) {
      continue;
    }

    const lowerText = `${link.text || ""} ${link.href || ""}`.toLowerCase();
    if (/logout|sign out|delete|remove|clear|reset|destroy/.test(lowerText)) {
      continue;
    }

    if (!isSameOrigin(href, baseUrl)) {
      continue;
    }

    if (pathFromUrl(href) === "/") {
      continue;
    }

    safeLinks.push({
      text: link.text || "",
      href,
    });
  }

  return uniqueBy(safeLinks, (item) => item.href).slice(0, 4);
}

function summarizeRoutes(routes, agenticExploration = null) {
  const agenticStates = agenticExploration?.states || [];
  const uniqueHeadings = uniqueBy(
    [
      ...routes.flatMap((route) => route.headings || []),
      ...agenticStates.flatMap((state) => state.headings || []),
    ].map((text) => ({ text })),
    (item) => item.text
  ).map((item) => item.text);

  const uniqueButtons = uniqueBy(
    [
      ...routes.flatMap((route) => route.buttons || []).map((button) => button.ariaLabel || button.text || button.id || button.dataTestId || ""),
      ...agenticStates.flatMap((state) => state.buttons || []),
    ].map((label) => ({ label })),
    (item) => item.label
  )
    .map((item) => item.label)
    .filter(Boolean);

  const uniqueLinks = uniqueBy(
    routes.flatMap((route) => route.links || []).map((link) => ({
      href: link.href,
      text: link.text || "",
    })),
    (item) => item.href
  );

  const uniqueInputs = uniqueBy(
    [
      ...routes.flatMap((route) => route.inputs || []).map((input) => ({
        label: input.label || input.placeholder || input.name || input.type || "",
        type: input.type || "",
      })),
      ...agenticStates.flatMap((state) => (state.inputs || []).map((label) => ({ label, type: "" }))),
    ],
    (item) => `${item.label}|${item.type}`
  )
    .map((item) => `${item.label}${item.type ? ` (${item.type})` : ""}`)
    .filter(Boolean);

  return {
    routeCount: routes.length,
    uniqueHeadings: uniqueHeadings.slice(0, 10),
    uniqueButtons: uniqueButtons.slice(0, 12),
    uniqueLinks: uniqueLinks.slice(0, 10),
    uniqueInputs: uniqueInputs.slice(0, 10),
    formsCount: routes.reduce((total, route) => total + (route.formsCount || 0), 0),
    dialogsCount: routes.reduce((total, route) => total + (route.dialogsCount || 0), 0),
    canvasesCount: routes.reduce((total, route) => total + (route.canvasesCount || 0), 0),
    stateCount: agenticExploration?.metrics?.uniqueStates || 1,
    completedActions: agenticExploration?.metrics?.completedActions || 0,
    coverageAreas: agenticExploration?.metrics?.coverageAreas || [],
  };
}

function buildEmptySummary() {
  return {
    routeCount: 0,
    uniqueHeadings: [],
    uniqueButtons: [],
    uniqueLinks: [],
    uniqueInputs: [],
    formsCount: 0,
    dialogsCount: 0,
    canvasesCount: 0,
    stateCount: 0,
    completedActions: 0,
    coverageAreas: [],
  };
}

function resolveTargetUrl(targetHref, baseUrl) {
  const href = String(targetHref || "").trim();
  if (!href || href.startsWith("#") || /^javascript:/i.test(href) || /^mailto:/i.test(href)) {
    return "";
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch (error) {
    return "";
  }
}

function pathFromUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch (error) {
    return "/";
  }
}

function isSameOrigin(candidateUrl, baseUrl) {
  try {
    return new URL(candidateUrl).origin === new URL(baseUrl).origin;
  } catch (error) {
    return false;
  }
}

function createRuntimeDiagnosticsCollector(context, secretValues = []) {
  const diagnostics = buildEmptyDiagnostics();
  const attachedPages = new WeakSet();
  const record = (category, item) => {
    const serialized = JSON.stringify(item);
    if (diagnostics[category].some((candidate) => JSON.stringify(candidate) === serialized)) return;
    diagnostics[category].push(item);
    if (diagnostics[category].length > 30) diagnostics[category].shift();
  };
  const sanitizeMessage = (value) => redactSecrets(
    String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200),
    secretValues
  );
  const sanitizeUrl = (value) => {
    try {
      const parsed = new URL(value);
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return sanitizeMessage(value).slice(0, 500);
    }
  };
  const attachPage = (page) => {
    if (attachedPages.has(page)) return;
    attachedPages.add(page);
    page.on("console", (message) => {
      if (message.type() === "error") {
        record("consoleErrors", {
          message: sanitizeMessage(message.text()),
          url: sanitizeUrl(page.url()),
        });
      }
    });
    page.on("pageerror", (error) => {
      record("pageErrors", {
        message: sanitizeMessage(error.message),
        url: sanitizeUrl(page.url()),
      });
    });
  };

  context.on("page", attachPage);
  return {
    attachPage,
    snapshot: () => JSON.parse(JSON.stringify(diagnostics)),
  };
}

function buildEmptyDiagnostics() {
  return {
    consoleErrors: [],
    pageErrors: [],
  };
}

function toPublicArtifactRun(run) {
  return {
    runId: run.runId,
    runDirectory: run.runDirectory,
    testsDirectory: run.testsDirectory,
    resultsDirectory: run.resultsDirectory,
    artifactsDirectory: run.artifactsDirectory,
    artifactBaseUrl: run.artifactBaseUrl,
  };
}

function uniqueBy(items, makeKey) {
  const output = [];
  const seen = new Set();

  for (const item of items || []) {
    const key = makeKey(item);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(item);
  }

  return output;
}

function uniqueStrings(items) {
  return uniqueBy(
    (items || []).map((item) => String(item || "").trim()).filter(Boolean),
    (item) => item
  );
}

module.exports = {
  capturePageObservation,
  exploreLiveProject,
  mergeLiveExplorationIntoInspection,
};
