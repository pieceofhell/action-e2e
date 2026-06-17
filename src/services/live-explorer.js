const { chromium } = require("playwright");
const {
  maybeInstallTargetProject,
  normalizeRuntimeConfig,
  startTargetRuntime,
} = require("./runtime-orchestrator");

async function exploreLiveProject({
  projectPath,
  inspection,
  runtimeConfig,
}) {
  const normalizedRuntime = normalizeRuntimeConfig(inspection.runtime, runtimeConfig);

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
      generatedAt: new Date().toISOString(),
    };
  }

  let runtimeHandle = null;
  let browser = null;
  let context = null;

  try {
    await maybeInstallTargetProject({
      targetProjectPath: projectPath,
      runtimeConfig: normalizedRuntime,
      label: "Target project installation before live exploration",
    });

    runtimeHandle = await startTargetRuntime({
      targetProjectPath: projectPath,
      runtimeConfig: normalizedRuntime,
    });

    browser = await chromium.launch({
      headless: true,
    });
    context = await browser.newContext({
      baseURL: runtimeHandle.baseUrl,
      viewport: {
        width: 1440,
        height: 900,
      },
    });

    const routes = [];
    const warnings = [];
    const visited = new Set();

    const initialPage = await context.newPage();
    const homeObservation = await observePage({
      page: initialPage,
      targetUrl: runtimeHandle.baseUrl,
      baseUrl: runtimeHandle.baseUrl,
    });
    routes.push(homeObservation);
    visited.add(homeObservation.path || "/");

    const safeLinks = pickSafeLinks(homeObservation.links, runtimeHandle.baseUrl);

    for (const link of safeLinks.slice(0, 2)) {
      try {
        const resolvedUrl = resolveTargetUrl(link.href, runtimeHandle.baseUrl);
        const resolvedPath = pathFromUrl(resolvedUrl);

        if (!resolvedUrl || visited.has(resolvedPath)) {
          continue;
        }

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
        warnings.push(`Failed to inspect a linked route during live exploration: ${error.message}`);
      }
    }

    return {
      attempted: true,
      status: "completed",
      mode: runtimeHandle.mode,
      baseUrl: runtimeHandle.baseUrl,
      startCommand: runtimeHandle.startCommand || "",
      routes,
      summary: summarizeRoutes(routes),
      warnings,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      attempted: true,
      status: "failed",
      mode: normalizedRuntime.mode,
      baseUrl: normalizedRuntime.baseUrl && normalizedRuntime.baseUrl !== "auto" ? normalizedRuntime.baseUrl : "",
      routes: [],
      summary: buildEmptySummary(),
      warnings: [],
      error: error.message,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    if (context) {
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
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
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

    const headings = uniqueObjects(
      Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"))
        .filter(isVisible)
        .map((element) => normalizeText(element.textContent))
        .filter(Boolean),
      (item) => item,
      8
    );

    const buttons = uniqueObjects(
      Array.from(document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit'], a[role='button']"))
        .filter(isVisible)
        .map((element) => ({
          text: normalizeText(element.textContent || element.value || element.getAttribute("aria-label") || ""),
          id: normalizeText(element.getAttribute("id") || ""),
          dataTestId: normalizeText(element.getAttribute("data-testid") || ""),
        }))
        .filter((item) => item.text || item.id || item.dataTestId),
      (item) => item.dataTestId || item.id || item.text,
      12
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
        .map((element) => ({
          label: inputLabel(element),
          placeholder: normalizeText(element.getAttribute("placeholder") || ""),
          name: normalizeText(element.getAttribute("name") || ""),
          type: normalizeText(element.getAttribute("type") || element.tagName.toLowerCase()),
        })),
      (item) => `${item.label}|${item.placeholder}|${item.name}|${item.type}`,
      10
    );

    const textContainer = document.querySelector("main") || document.body;
    const visibleTextExcerpt = normalizeText(textContainer?.innerText || "").slice(0, 1800);

    return {
      title: normalizeText(document.title || ""),
      url: window.location.href,
      path: `${window.location.pathname}${window.location.search}`,
      headings,
      buttons,
      links,
      inputs,
      formsCount: document.querySelectorAll("form").length,
      dialogsCount: document.querySelectorAll("dialog, [role='dialog']").length,
      canvasesCount: document.querySelectorAll("canvas").length,
      visibleTextExcerpt,
    };
  });

  return {
    ...observation,
    url: observation.url || targetUrl,
    path: observation.path || pathFromUrl(targetUrl),
    baseUrl,
  };
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

function summarizeRoutes(routes) {
  const uniqueHeadings = uniqueBy(
    routes.flatMap((route) => route.headings || []).map((text) => ({ text })),
    (item) => item.text
  ).map((item) => item.text);

  const uniqueButtons = uniqueBy(
    routes.flatMap((route) => route.buttons || []).map((button) => ({
      label: button.text || button.id || button.dataTestId || "",
    })),
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
    routes.flatMap((route) => route.inputs || []).map((input) => ({
      label: input.label || input.placeholder || input.name || input.type || "",
      type: input.type || "",
    })),
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
  exploreLiveProject,
  mergeLiveExplorationIntoInspection,
};
