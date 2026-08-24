const AUTH_ADAPTERS = new Set([
  "janvas-canvas-token",
  "cookie-session",
  "form-login",
  "http-basic",
]);

const ENV_REFERENCE_PATTERN = /^E2P_AUTH_[A-Z0-9_]+$/;

function normalizeAuthConfig(input = {}) {
  const mode = input?.mode === "authenticated" ? "authenticated" : "guest";

  if (mode === "guest") {
    return {
      mode: "guest",
      profileId: "guest",
      adapter: "none",
      allowedPaths: ["/"],
      initialPath: "/",
    };
  }

  const adapter = AUTH_ADAPTERS.has(input.adapter) ? input.adapter : "janvas-canvas-token";
  const allowedPaths = normalizePathList(input.allowedPaths, adapter === "janvas-canvas-token"
    ? ["/profile", "/inbox"]
    : ["/"]);
  const initialPath = normalizePath(input.initialPath || allowedPaths[0] || "/");

  if (!isPathAllowedByPatterns(initialPath, allowedPaths)) {
    throw new Error("The initial authenticated path must be included in the read-only path allowlist.");
  }

  return {
    mode,
    profileId: sanitizeIdentifier(input.profileId || `${adapter}-profile`),
    adapter,
    secretEnvVar: normalizeEnvReference(input.secretEnvVar),
    usernameEnvVar: normalizeEnvReference(input.usernameEnvVar),
    passwordEnvVar: normalizeEnvReference(input.passwordEnvVar),
    providerUrl: normalizeOptionalUrl(input.providerUrl),
    cookieName: sanitizeCookieName(input.cookieName || "session"),
    loginPath: normalizePath(input.loginPath || "/login"),
    authPaths: normalizePathList(input.authPaths, [input.loginPath || "/login"]),
    usernameSelector: normalizeSelector(input.usernameSelector || "input[name='username']"),
    passwordSelector: normalizeSelector(input.passwordSelector || "input[type='password']"),
    submitSelector: normalizeSelector(input.submitSelector || "button[type='submit']"),
    successPath: input.successPath ? normalizePath(input.successPath) : "",
    successText: sanitizeText(input.successText, 160),
    allowedPaths,
    initialPath,
  };
}

function getAuthConfigurationStatus(input, environment = process.env) {
  let config;

  try {
    config = normalizeAuthConfig(input);
  } catch (error) {
    return {
      configured: false,
      mode: "authenticated",
      error: error.message,
      missingFields: [],
      metadata: null,
    };
  }

  if (config.mode === "guest") {
    return {
      configured: true,
      mode: "guest",
      missingFields: [],
      metadata: toPublicAuthMetadata(config),
    };
  }

  const required = requiredSecretReferences(config);
  const missingFields = required
    .filter(({ reference }) => !reference || !environment[reference])
    .map(({ field }) => field);

  return {
    configured: missingFields.length === 0,
    mode: config.mode,
    missingFields,
    metadata: toPublicAuthMetadata(config),
  };
}

function resolveAuthSecrets(input, environment = process.env) {
  const config = normalizeAuthConfig(input);

  if (config.mode !== "authenticated") {
    return {
      config,
      values: {},
      secretValues: [],
      dispose() {},
    };
  }

  const status = getAuthConfigurationStatus(config, environment);
  if (!status.configured) {
    throw new Error(`The authenticated profile is missing required secret references: ${status.missingFields.join(", ")}.`);
  }

  const values = {};
  for (const { field, reference } of requiredSecretReferences(config)) {
    values[field] = String(environment[reference]);
  }

  const secretValues = Object.values(values).filter(Boolean);
  let disposed = false;

  return {
    config,
    values,
    secretValues,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const key of Object.keys(values)) {
        values[key] = "";
      }
      secretValues.fill("");
    },
  };
}

function requiredSecretReferences(config) {
  if (config.adapter === "form-login" || config.adapter === "http-basic") {
    return [
      { field: "username", reference: config.usernameEnvVar },
      { field: "password", reference: config.passwordEnvVar },
    ];
  }

  return [{ field: "secret", reference: config.secretEnvVar }];
}

function toPublicAuthMetadata(input) {
  const config = normalizeAuthConfig(input);
  return {
    mode: config.mode,
    profileId: config.profileId,
    adapter: config.adapter,
    allowedPaths: [...config.allowedPaths],
    initialPath: config.initialPath,
    successPath: config.successPath || "",
    evidencePolicy: config.mode === "authenticated"
      ? {
          screenshots: "post-authentication-only",
          video: "disabled",
          trace: "disabled",
          networkPayloads: "disabled",
        }
      : {
          screenshots: "enabled",
          video: "enabled",
          trace: "enabled",
          networkPayloads: "playwright-default",
        },
  };
}

function buildRestrictedChildEnvironment(additions = {}, environment = process.env) {
  const allowedKeys = [
    "PATH",
    "Path",
    "PATHEXT",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "NUMBER_OF_PROCESSORS",
  ];
  const childEnvironment = {};

  for (const key of allowedKeys) {
    if (environment[key]) {
      childEnvironment[key] = environment[key];
    }
  }

  for (const [key, value] of Object.entries(additions)) {
    if (value !== undefined && value !== null) {
      childEnvironment[key] = String(value);
    }
  }

  return childEnvironment;
}

function redactSecrets(value, secretValues = []) {
  let output = String(value ?? "");
  const candidates = [...new Set(secretValues.map((secret) => String(secret || "")).filter(Boolean))]
    .sort((left, right) => right.length - left.length);

  for (const secret of candidates) {
    output = output.split(secret).join("[REDACTED]");
  }

  output = output
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");

  return output;
}

function normalizeEnvReference(value) {
  const reference = String(value || "").trim();
  if (!reference) return "";
  if (!ENV_REFERENCE_PATTERN.test(reference)) {
    throw new Error("Authentication secret references must use an E2P_AUTH_ environment-variable name.");
  }
  return reference;
}

function normalizePathList(value, fallback) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n,]/);
  const items = rawItems.map(normalizePathPattern).filter(Boolean);
  return [...new Set(items.length ? items : fallback.map(normalizePathPattern))];
}

function normalizePathPattern(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const wildcard = raw.endsWith("/*");
  const normalized = normalizePath(wildcard ? raw.slice(0, -2) : raw);
  return wildcard && normalized !== "/" ? `${normalized}/*` : normalized;
}

function normalizePath(value) {
  const raw = String(value || "/").trim();
  if (/^https?:\/\//i.test(raw)) {
    const parsed = new URL(raw);
    return `${parsed.pathname}${parsed.search}` || "/";
  }
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    throw new Error("Authentication paths must be relative paths that start with one slash.");
  }
  return raw;
}

function isPathAllowedByPatterns(candidate, patterns) {
  const path = normalizePath(candidate).split("?")[0];
  return (patterns || []).some((pattern) => {
    const normalizedPattern = normalizePathPattern(pattern);
    if (normalizedPattern.endsWith("/*")) {
      const prefix = normalizedPattern.slice(0, -2);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    return path === normalizedPattern.split("?")[0];
  });
}

function normalizeOptionalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new URL(raw);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Authentication provider URLs must use HTTP or HTTPS.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function normalizeSelector(value) {
  const selector = sanitizeText(value, 220);
  if (!selector || /[\r\n]/.test(selector)) {
    throw new Error("Authentication selectors must be single-line CSS selectors.");
  }
  return selector;
}

function sanitizeCookieName(value) {
  const name = String(value || "").trim();
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
    throw new Error("The session cookie name is invalid.");
  }
  return name;
}

function sanitizeIdentifier(value) {
  return String(value || "profile")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "profile";
}

function sanitizeText(value, limit) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}

module.exports = {
  AUTH_ADAPTERS,
  buildRestrictedChildEnvironment,
  getAuthConfigurationStatus,
  isPathAllowedByPatterns,
  normalizeAuthConfig,
  redactSecrets,
  resolveAuthSecrets,
  toPublicAuthMetadata,
};
