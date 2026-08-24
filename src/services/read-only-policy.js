const { isPathAllowedByPatterns } = require("./auth-config");

const SAFE_ACTION_TYPES = new Set([
  "navigate",
  "assert-body",
  "assert-heading",
  "assert-text",
  "assert-url",
  "capture",
]);

function createReadOnlyPolicy({ baseUrl, allowedPaths, authPaths = [] }) {
  const targetOrigin = new URL(baseUrl).origin;
  const events = [];
  let authenticationActive = true;

  return {
    async handleRoute(route) {
      const request = route.request();
      const method = request.method().toUpperCase();
      const parsed = new URL(request.url());
      const resourceType = request.resourceType();
      const routeHint = `${parsed.pathname}${parsed.search}`;

      if (parsed.origin !== targetOrigin) {
        events.push(buildEvent(request, "blocked", "external-origin"));
        await route.abort("blockedbyclient");
        return;
      }


      if (/\b(delete|destroy|remove|publish|submit|send|upload|create|update|logout|signout)\b/i.test(routeHint)) {
        events.push(buildEvent(request, "blocked", "unsafe-route-semantics"));
        await route.abort("blockedbyclient");
        return;
      }

      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const allowedAuthenticationRequest = authenticationActive
          && authPaths.some((pattern) => isPathAllowedByPatterns(parsed.pathname, [pattern]));

        if (!allowedAuthenticationRequest) {
          events.push(buildEvent(request, "blocked", "mutation-method"));
          await route.abort("blockedbyclient");
          return;
        }

        events.push(buildEvent(request, "allowed", "authentication-endpoint"));
        await route.continue();
        return;
      }

      const allowedAuthenticationDocument = authenticationActive
        && authPaths.some((pattern) => isPathAllowedByPatterns(parsed.pathname, [pattern]));
      if (resourceType === "document"
        && !allowedAuthenticationDocument
        && !isPathAllowedByPatterns(parsed.pathname, allowedPaths)) {
        events.push(buildEvent(request, "blocked", "navigation-path"));
        await route.abort("blockedbyclient");
        return;
      }

      await route.continue();
    },
    markAuthenticated() {
      authenticationActive = false;
    },
    getSummary() {
      return {
        blockedRequestCount: events.filter((event) => event.decision === "blocked").length,
        allowedAuthenticationRequestCount: events.filter((event) => event.rule === "authentication-endpoint").length,
        events: events.slice(0, 100),
      };
    },
  };
}

function validateAuthenticatedActionPlan(plan, authMetadata) {
  if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0) {
    throw new Error("An authenticated action plan must contain at least one action.");
  }

  if (plan.actions.length > 20) {
    throw new Error("An authenticated action plan cannot contain more than 20 actions.");
  }

  let hasNavigation = false;

  for (const action of plan.actions) {
    if (!SAFE_ACTION_TYPES.has(action?.type)) {
      throw new Error(`Authenticated action type '${action?.type || "unknown"}' is not allowed.`);
    }

    if (action.type === "navigate") {
      if (!isPathAllowedByPatterns(action.path, authMetadata.allowedPaths)) {
        throw new Error(`Authenticated navigation path '${action.path}' is outside the read-only allowlist.`);
      }
      hasNavigation = true;
    }

    if (["assert-heading", "assert-text"].includes(action.type)) {
      const text = String(action.text || "").trim();
      if (!text || text.length > 240) {
        throw new Error(`Authenticated ${action.type} actions require concise observed text.`);
      }
    }

    if (action.type === "assert-url" && !isPathAllowedByPatterns(action.path, authMetadata.allowedPaths)) {
      throw new Error(`Authenticated URL assertion '${action.path}' is outside the read-only allowlist.`);
    }
  }

  if (!hasNavigation) {
    throw new Error("An authenticated action plan must navigate to an approved read-only route.");
  }

  return {
    id: sanitizeIdentifier(plan.id),
    title: sanitizeText(plan.title, 160) || "Authenticated read-only flow",
    actions: plan.actions.map(normalizeAction),
  };
}

function normalizeAction(action) {
  const normalized = { type: action.type };
  if (action.path) normalized.path = String(action.path).trim();
  if (action.text) normalized.text = sanitizeText(action.text, 240);
  if (action.name) normalized.name = sanitizeIdentifier(action.name);
  return normalized;
}

function buildEvent(request, decision, rule) {
  const parsed = new URL(request.url());
  return {
    method: request.method().toUpperCase(),
    path: parsed.pathname,
    resourceType: request.resourceType(),
    decision,
    rule,
  };
}

function sanitizeIdentifier(value) {
  return String(value || "authenticated-flow")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 100) || "authenticated-flow";
}

function sanitizeText(value, limit) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}

module.exports = {
  SAFE_ACTION_TYPES,
  createReadOnlyPolicy,
  validateAuthenticatedActionPlan,
};
