# Authenticated Read-Only E2E Flows

## Status

Implemented and validated on August 11, 2026.

The feature adds authenticated web exploration and E2E execution without giving authentication values to the browser UI, language model, generated tests, run metadata, logs, or downloadable artifacts. The implemented scope is intentionally read-only: authentication, navigation, observation, assertions, and post-authentication screenshots are supported; data creation, modification, publication, sending, uploading, and deletion are not.

## Outcome

Authenticated testing is feasible in E2P. The production path now uses:

1. environment-backed secret references;
2. trusted authentication adapters;
3. isolated Playwright contexts with no saved `storageState`;
4. schema-constrained action plans instead of unrestricted model-generated JavaScript;
5. a browser-network read-only policy;
6. authentication-aware evidence rules;
7. artifact quarantine and byte-level secret scanning;
8. explicit human selection of access mode, adapter, and allowed routes.

The existing guest path remains available and retains its Playwright specification, screenshot, video, and trace behavior.

## User workflow

1. Inject the authentication value through an `E2P_AUTH_*` environment variable or an external secret facility that supplies such a variable to the E2P process.
2. Start E2P.
3. Load and inspect the target project.
4. Select `Authenticated / read-only` in the Access mode card.
5. Select an authentication adapter.
6. Enter only environment-reference names and non-secret adapter metadata.
7. Configure the smallest practical read-only path allowlist.
8. Select `Check secret configuration`.
9. Run authenticated live exploration.
10. Review and approve the resulting authenticated read-only flows.
11. Generate constrained action plans.
12. Run the plans with the trusted executor.
13. Review session status, blocked requests, screenshots, and secret-scan status.

The UI never contains a field for a credential value.

## Supported adapters

### Janvas Canvas token

`janvas-canvas-token` resolves one token reference. The trusted adapter creates two HttpOnly cookies in the isolated browser context:

- the Canvas API token cookie expected by Janvas;
- the configured Canvas provider-base cookie.

The adapter avoids the visible Janvas onboarding form and its credential-bearing dashboard request. It verifies that a protected route did not return to the guest entry point and that the authenticated application shell is visible.

### Session cookie

`cookie-session` resolves one environment-backed session value and adds a user-named HttpOnly cookie for the target origin. This also provides a practical handoff for SSO or MFA systems when a dedicated test session has already been established outside E2P.

### Form login

`form-login` resolves separate username and password references. The evaluator supplies:

- login path;
- authentication request path allowlist;
- username selector;
- password selector;
- submit selector;
- optional success path and text.

The trusted adapter performs this step before evidence capture. Non-read requests are permitted only while authentication is active and only for explicitly configured authentication paths.

### HTTP Basic

`http-basic` resolves separate username and password references and supplies them through Playwright's trusted context configuration.

## Secret handling

### Input contract

- Every reference must match `E2P_AUTH_[A-Z0-9_]+`.
- The browser sends only a reference name, never its value.
- `POST /api/auth/status` returns configured/missing status and public profile metadata only.
- Missing-field responses use logical names such as `secret`, `username`, or `password`; they do not echo environment names.

### Runtime resolution

`src/services/auth-config.js` resolves values only when authenticated exploration or execution starts. It returns a short-lived handle used by trusted server code. Disposal clears the mutable in-memory copies on normal completion and error paths.

E2P does not write authentication values to:

- `.env` files;
- generated JavaScript;
- constrained action plans;
- `auth-metadata.json`;
- inspection or runtime JSON;
- model prompts;
- stdout or stderr;
- Playwright state files;
- API responses.

External secret managers remain compatible when they inject values into the E2P process environment. E2P does not require or persist the manager's underlying storage format.

### Process isolation

Guest Playwright child processes receive an explicit operating-system environment allowlist plus `TARGET_BASE_URL`. They no longer inherit the complete E2P environment.

Target installation and startup processes preserve ordinary runtime variables but remove every `E2P_AUTH_*` value. The target therefore receives the authenticated browser request or session cookie, not the E2P secret store.

## Trusted execution model

Authenticated flows do not run unrestricted JavaScript authored by a model. The permitted action vocabulary is:

- `navigate` to a configured read-only relative path;
- `assert-body`;
- `assert-heading` using observed text;
- `assert-text` using observed text;
- `assert-url` for an allowed path;
- `capture` for post-authentication screenshot evidence.

The validator requires at least one navigation, rejects unknown action types, rejects paths outside the allowlist, limits plan length, and normalizes saved action data. A configured model may propose this JSON structure after live exploration, but deterministic rendering is used when the response is absent, malformed, or unsafe.

The authenticated executor validates every saved plan again immediately before execution. Generated actions cannot access Node, `process.env`, cookies, headers, the browser context, arbitrary selectors, network APIs, or script evaluation.

## Read-only policy

`src/services/read-only-policy.js` is installed before the first target page. It enforces:

- same-origin requests only;
- default denial of `POST`, `PUT`, `PATCH`, and `DELETE`;
- temporary non-read exceptions only for configured form-authentication paths;
- document navigation only to allowed read-only paths;
- rejection of unsafe route semantics such as create, update, submit, send, upload, publish, delete, logout, or destroy;
- sanitized policy events containing method, path, resource type, decision, and rule only.

The policy is authoritative. Acceptance criteria and model output cannot override it.

HTTP methods are not a complete proof of read-only behavior because a poorly designed application can mutate through `GET`. Small explicit path allowlists and unsafe-route filtering reduce this risk. A target-specific adapter should add stronger endpoint rules where required.

## Pipeline behavior

### Project inspection

Static inspection remains credential-free. It may detect authentication surfaces, but detection does not grant permission to authenticate.

### Live exploration

Guest exploration works as before. Authenticated exploration:

1. starts the target runtime;
2. resolves the selected profile;
3. creates a fresh context through the trusted adapter;
4. installs the read-only policy;
5. visits the initial protected route;
6. verifies the session;
7. observes concrete allowlisted routes only;
8. sanitizes DOM observations;
9. closes the context and disposes the secret handle.

The result includes public access metadata, verification status, and policy counts.

### Flow and criteria generation

Authenticated planning generates `authenticated-read-only` candidates from observed protected routes or configured allowlisted paths. Every flow includes:

- authenticated access mode;
- source signals;
- confidence;
- required role assumptions;
- explicit prohibited effects;
- navigation and observation criteria.

Model refinement receives sanitized route evidence and access metadata only.

### Test generation

Guest runs generate `*.spec.cjs` files and a Playwright configuration. Authenticated runs generate `*.actions.json` files and `auth-metadata.json`. Neither authenticated file contains environment references or credential values.

### Execution and evidence

Guest runs execute through the Playwright CLI. Authenticated runs execute directly through `authenticated-executor.js`.

Authenticated evidence includes post-authentication screenshots only. The following remain disabled:

- Playwright trace;
- video;
- request and response payload capture;
- raw cookie and header capture;
- raw browser console persistence.

Immediately before each screenshot, the trusted executor checks the current URL, visible page text, and visible non-password form-control values against every active credential. A match suppresses the capture and fails that flow with a sanitized error. Protected and hidden fields are excluded because their values are not rendered into the image. This protects against a target accidentally reflecting a token, username, or password into visible page content before the binary image is created.

Results include test counts, session status, read-only policy summary, evidence references, and secret-scan status.

## Artifact quarantine

An authenticated run receives a `.quarantine` marker before execution. While the marker exists, `/artifacts/<run-id>/...` returns HTTP 423.

After reports and screenshots are written, `artifact-store.js` scans every file for every active secret byte sequence. If a match is found:

1. matching files are removed;
2. execution fails with a sanitized message;
3. the quarantine marker remains;
4. no artifact URL is released.

If the scan passes, `results/auth-execution.json` records only `passed` and the number of scanned files, then the marker is removed.

## API changes

### `GET /api/health`

Returns an ephemeral request token used by the same-origin UI for sensitive local operations.

### `POST /api/auth/status`

Validates profile shape and required environment-reference availability without returning values or reference names.

### Existing pipeline endpoints

`/api/project/explore-live`, `/api/pipeline/plan`, `/api/tests/generate`, and `/api/tests/run` accept authentication metadata. Live exploration and execution require the ephemeral loopback request token because they can resolve authentication values.

## UI changes

The horizontal pipeline now contains an explicit Access mode stage. The new card provides:

- Guest or Authenticated/read-only selection;
- adapter selection;
- profile identifier;
- environment-reference fields;
- adapter-specific non-secret options;
- initial path and read-only path allowlist;
- optional success checks;
- configuration-status check;
- persistent safety explanation.

Inspection, artifacts, and result cards display access mode. Authenticated results display adapter, verification state, blocked requests, and secret-scan status.

## Validation performed

### Automated suite

The current `npm.cmd test` suite executes 21 tests. Authentication coverage includes:

- configuration normalization;
- environment-only resolution and disposal;
- public metadata without values or references;
- redaction;
- child and target process environment isolation;
- constrained-plan validation;
- authenticated route planning;
- real Chromium session-cookie authentication;
- an automatic browser `POST` blocked before reaching the temporary server;
- authenticated screenshot creation;
- screenshot suppression when a canary credential is rendered by the target;
- secret scanning;
- complete guest generation and Playwright execution regression.

The guest regression was additionally repeated through the real E2P HTTP API. Run `action-e2e-prototype-2026-08-11T22-38-45-149Z` passed 1 of 1 test and retained the pre-existing screenshot, video, and trace evidence contract. No authentication data was involved.

### Janvas platform run

Run `canvas-wrapper-test-2026-08-11T22-45-34-579Z` used the deterministic Janvas acceptance provider and a random environment-backed canary. No real institutional credential was present or required. The local Janvas development server was supervised separately and supplied as an external URL so the authentication result was independent of a transient development-process shutdown observed in one command-mode attempt.

- live exploration: completed;
- session: verified;
- routes: `/profile` and `/inbox`;
- generated plans: 2;
- passed: 2;
- failed: 0;
- duration: 3.2 seconds;
- screenshots: 2;
- blocked external image requests: 2;
- delivered mutating requests: 0;
- secret scan: passed across 15 files;
- quarantine: released.

The screenshots show deterministic profile and inbox data. No message was composed or sent, no assignment was submitted, and no data was created, changed, published, uploaded, or deleted.

### UI validation

The local E2P page was inspected in a real browser. The Access mode controls rendered correctly, the Janvas adapter exposed only reference/configuration fields, `Check secret configuration` returned `Configured / read-only`, and the browser console contained no errors.

## Files implemented

- `src/services/auth-config.js`
- `src/services/auth-session.js`
- `src/services/read-only-policy.js`
- `src/services/authenticated-executor.js`
- `src/services/live-explorer.js`
- `src/services/flow-planner.js`
- `src/services/ai-workflows.js`
- `src/services/test-generator.js`
- `src/services/test-runner.js`
- `src/services/runtime-orchestrator.js`
- `src/services/artifact-store.js`
- `src/services/insight-builder.js`
- `src/server.js`
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `test/services.test.cjs`
- `test/authentication.integration.test.cjs`

## Remaining limitations

- Interactive MFA and CAPTCHA are not automated. Use a pre-established session-cookie reference when permitted.
- Authenticated action plans intentionally do not click controls or fill non-authentication forms.
- Screenshot evidence can contain private application content; retention and sharing remain the evaluator's responsibility.
- Traces and videos remain disabled for authenticated contexts until their handling of cookies, headers, and request bodies can be proven safe.
- A generic policy cannot prove that every target `GET` endpoint is side-effect free.
- Secret persistence relies on the environment or external secret manager used to launch E2P; E2P itself does not provide a shared hosted vault.

## Extension checklist

Before adding another adapter:

1. define required environment references and public metadata;
2. keep values inside trusted server code;
3. install the network policy before opening a page;
4. pause all evidence during authentication;
5. define explicit success verification;
6. define minimal allowed paths and authentication endpoints;
7. close context and dispose handles in every exit path;
8. add valid, missing, invalid, mutation, canary, timeout, and parallel-isolation tests;
9. validate guest regression;
10. update this document and `specs.md`.
