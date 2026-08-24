const { normalizeAuthConfig, redactSecrets, resolveAuthSecrets, toPublicAuthMetadata } = require("./auth-config");
const { createReadOnlyPolicy } = require("./read-only-policy");

async function createAuthenticatedSession({ browser, baseUrl, authConfig, viewport }) {
  const config = normalizeAuthConfig(authConfig);
  if (config.mode !== "authenticated") {
    throw new Error("An authenticated session requires authenticated access mode.");
  }

  const resolved = resolveAuthSecrets(config);
  let context = null;

  try {
    const contextOptions = {
      baseURL: baseUrl,
      viewport: viewport || { width: 1440, height: 900 },
    };

    if (config.adapter === "http-basic") {
      contextOptions.httpCredentials = {
        username: resolved.values.username,
        password: resolved.values.password,
      };
    }

    context = await browser.newContext(contextOptions);
    const policy = createReadOnlyPolicy({
      baseUrl,
      allowedPaths: config.allowedPaths,
      authPaths: config.adapter === "form-login" ? config.authPaths : [],
    });
    await context.route("**/*", (route) => policy.handleRoute(route));

    if (config.adapter === "janvas-canvas-token") {
      await context.addCookies([
        buildCookie(baseUrl, "canvasApiKey", resolved.values.secret),
        buildCookie(baseUrl, "canvasApiBase", config.providerUrl || baseUrl),
      ]);
      policy.markAuthenticated();
    } else if (config.adapter === "cookie-session") {
      await context.addCookies([
        buildCookie(baseUrl, config.cookieName, resolved.values.secret),
      ]);
      policy.markAuthenticated();
    } else if (config.adapter === "form-login") {
      await completeFormLogin({
        context,
        baseUrl,
        config,
        credentials: resolved.values,
        policy,
      });
    } else if (config.adapter === "http-basic") {
      policy.markAuthenticated();
    }

    const sessionSecretValues = [...resolved.secretValues];
    return {
      context,
      config,
      metadata: toPublicAuthMetadata(config),
      policy,
      secretValues: sessionSecretValues,
      async verifyPage(page) {
        await verifyAuthenticatedPage(page, config, baseUrl);
      },
      async dispose() {
        await context.close().catch(() => {});
        resolved.dispose();
        sessionSecretValues.fill("");
      },
    };
  } catch (error) {
    if (context) await context.close().catch(() => {});
    const sanitizedMessage = redactSecrets(error?.message || error, resolved.secretValues);
    resolved.dispose();
    throw new Error(`Authenticated session preparation failed: ${sanitizedMessage}`);
  }
}

async function completeFormLogin({ context, baseUrl, config, credentials, policy }) {
  const page = await context.newPage();

  try {
    await page.goto(new URL(config.loginPath, baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.locator(config.usernameSelector).fill(credentials.username);
    await page.locator(config.passwordSelector).fill(credentials.password);
    await Promise.all([
      page.waitForLoadState("domcontentloaded").catch(() => {}),
      page.locator(config.submitSelector).click(),
    ]);
    policy.markAuthenticated();
    await verifyAuthenticatedPage(page, config, baseUrl);
  } finally {
    await page.close().catch(() => {});
  }
}

async function verifyAuthenticatedPage(page, config, baseUrl) {
  const current = new URL(page.url(), baseUrl);

  if (config.successPath && current.pathname !== config.successPath) {
    throw new Error("The authenticated session did not reach the configured success path.");
  }

  if (config.successText) {
    const indicator = page.getByText(config.successText, { exact: false }).first();
    await indicator.waitFor({ state: "visible", timeout: 15000 });
  }

  if (config.adapter === "janvas-canvas-token" && current.pathname === "/") {
    throw new Error("Janvas redirected to the guest entry point instead of an authenticated route.");
  }


  if (config.adapter === "janvas-canvas-token") {
    await page.locator("main").first().waitFor({ state: "visible", timeout: 15000 });
  }
}

function buildCookie(baseUrl, name, value) {
  const parsed = new URL(baseUrl);
  return {
    name,
    value,
    url: parsed.origin,
    httpOnly: true,
    secure: parsed.protocol === "https:",
    sameSite: "Lax",
  };
}

module.exports = {
  createAuthenticatedSession,
  verifyAuthenticatedPage,
};
