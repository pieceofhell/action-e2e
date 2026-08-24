# Action E2E Prototype - Status Report

Updated: 2026-08-11

## Executive Summary

The prototype is a local, functional implementation of the proposed pipeline for AI-assisted E2E test generation. It accepts a local web project, inspects available evidence, supports guest or authenticated read-only access, proposes user flows and acceptance criteria, requires human approval, produces isolated Playwright artifacts, executes them, and presents the results with visual evidence.

## What Is Implemented

| Planned pipeline stage | Implemented mechanism | Observable outcome |
| --- | --- | --- |
| 1. Project selection | Local directory input and Windows folder-picker endpoint | The target path is explicit before analysis begins. |
| 2. Project inspection | README, manifests, directory structure, relevant source excerpts, UI hints, and nested package-manifest detection | Detects framework, language, probable runtime, warnings, and confidence. |
| 3. Access mode | Guest path or trusted environment-backed authenticated adapter | Credentials remain outside the browser, model, generated files, and artifacts. |
| 4. User-flow proposal | Heuristic planner plus optional model refinement | Candidate flows are grounded in detected routes, forms, actions, canvas elements, and live exploration when available. |
| 5. Acceptance criteria | Structured Given/When/Then criteria shown as editable text | The reviewer can change and approve each flow before any test is produced. |
| 6. Test generation | Guest Playwright specs or authenticated constrained action plans | Unsafe model output is rejected and deterministic fallback remains available. |
| 7. Test execution | Guest CLI or trusted authenticated executor | The target is started locally; authenticated mutations are blocked at the network layer. |
| 8. Result consolidation | Reports, insights, policy status, secret scan, and access-aware visual evidence | Guest runs retain screenshot/video/trace; authenticated runs retain scanned post-authentication screenshots. |

## Model Support

The model layer is intentionally separable from the deterministic and human-review layers. The UI supports:

- Local heuristics, which keep the entire pipeline functional without a model;
- local Ollama, including manually entered model names such as `openllama:8b`;
- local LM Studio through its OpenAI-compatible server;
- OpenRouter, Groq, Together AI, and Hugging Face Inference Providers;
- a custom OpenAI-compatible endpoint.

Model-assisted output is never accepted silently. The model can refine inspection, flows, criteria, test bodies, and result insights; invalid or unsafe test code automatically falls back to the deterministic generator.

## Concrete Validation Evidence

### Automated checks

Command executed after the authenticated-flow implementation:

```text
npm.cmd test
```

Result: **21 of 21 tests passed**.

- Provider normalization: validates local and hosted configuration requirements.
- Playwright report parsing: validates preservation of screenshots, videos, traces, and execution errors.
- Authentication configuration, redaction, disposal, environment isolation, constrained actions, route planning, and artifact scanning.
- Real Chromium authenticated execution with an automatic `POST` blocked before reaching a temporary target server.
- Real Chromium suppression of a screenshot when the target visibly renders a canary credential, with no credential bytes persisted.
- Complete guest generation and Playwright execution regression.
- Vinext runtime inference, loopback fallback, announced-URL parsing, sanitized early-exit diagnostics, and Firefox compositing safeguards.
- Exact accessible-name locator generation from live interface evidence.

### End-to-end run: Dopa

- Target: `C:\Users\henri\Documents\dopa`.
- Detection: Vinext, TypeScript, commerce, high confidence.
- Runtime: `npm run dev` at `http://localhost:3000`.
- Live exploration: completed with one route, eight headings, visible actions, and one search input.
- Run ID: `dopa-2026-08-11T23-26-07-771Z`.
- Runtime health: healthy, with no development overlay detected.
- Result: **1 passed, 0 failed** in 2,926 ms.
- Evidence: screenshot, video, and Playwright trace.
- Cleanup: port 3000 released after execution.
- Target validation: Vinext build passed, Dopa's 6/6 internal tests passed, and ESLint reported no errors.
- Residual target risk: Dopa's dependency audit reports four high-severity advisories in the Next.js/PostCSS/Sharp chain. The complete automated fix changes the exact Next.js version, so it was not forced without a separate compatibility upgrade.

Firefox 150 validation kept local heuristics selected despite an available Ollama runtime. Loading Dopa through the UI took 396 ms, compared with 25.1 seconds when the previous automatic Ollama selection invoked model inference. No browser-console errors were observed.

### Guest regression through the E2P HTTP service

- Run ID: `action-e2e-prototype-2026-08-11T22-38-45-149Z`.
- Access: guest.
- Result: **1 passed, 0 failed**.
- Duration: 1,064 ms.
- Evidence: screenshot, video, and Playwright trace.
- Authentication data: none.

This run used the public `/api/tests/generate` and protected `/api/tests/run` service flow against a disposable local page, confirming that the original guest execution branch remains operational after the authenticated-flow changes.

### Authenticated end-to-end run: Janvas

- Run ID: `canvas-wrapper-test-2026-08-11T22-45-34-579Z`.
- Access: `janvas-canvas-token`, authenticated read-only.
- Routes: `/profile` and `/inbox`.
- Session: verified.
- Result: **2 passed, 0 failed**.
- Duration: 3,226 ms.
- Evidence: two post-authentication screenshots.
- Network policy: two external image requests blocked; zero mutating requests delivered.
- Secret scan: passed across 15 files; quarantine released.
- Credential source: random runtime-only canary through an environment reference; no real institutional credential used.
- Runtime: the Janvas development server was supervised independently and supplied to E2P as an external local URL.

### End-to-end run: Janvas / Canvas Wrapper

Target: `C:\Users\henri\Documents\GitHub\canvas-wrapper-test`

- Detected framework: Next.js.
- Detected nested application manifest: `apps/web/package.json`.
- Runtime mode: `command` (`bun run dev:web`).
- Proposed flows: 2; human-approved flows: 1.
- Run id: `canvas-wrapper-test-2026-07-26T05-02-24-131Z`.
- Result: 1 total, 1 passed, 0 failed, 0 skipped.
- Duration: 1,709 ms.
- Preserved evidence for the passed test: screenshot, video, and Playwright trace.

Primary result files:

```text
prototype-runs/canvas-wrapper-test-2026-07-26T05-02-24-131Z/results/playwright-results.json
prototype-runs/canvas-wrapper-test-2026-07-26T05-02-24-131Z/results/visual-evidence.json
prototype-runs/canvas-wrapper-test-2026-07-26T05-02-24-131Z/results/test-artifacts/render-main-interface-Main-interface-rendering/test-finished-1.png
prototype-runs/canvas-wrapper-test-2026-07-26T05-02-24-131Z/results/test-artifacts/render-main-interface-Main-interface-rendering/video.webm
prototype-runs/canvas-wrapper-test-2026-07-26T05-02-24-131Z/results/test-artifacts/render-main-interface-Main-interface-rendering/trace.zip
```

### End-to-end run: MDN To-do Notifications

Target: the `to-do-notifications` example from the [MDN DOM examples repository](https://github.com/mdn/dom-examples/tree/main/to-do-notifications).

- Detected framework: Static web application.
- Detected application type: form-centric.
- Runtime mode: internal `static` server.
- Proposed and human-approved flows: 3.
- Run id: `to-do-notifications-2026-07-26T05-02-29-196Z`.
- Result: 3 total, 3 passed, 0 failed, 0 skipped.
- Duration: 1,732 ms.
- Preserved evidence: 9 files in total, consisting of one screenshot, one video, and one trace for each passed test.

The generated tests covered initial interface rendering, primary action review, and primary form review. This target complements Janvas by exercising the pipeline against a static interface with interactive form behavior.

## Why This Adds Value

The prototype demonstrates more than test execution:

1. It turns heterogeneous repository evidence into reviewable acceptance criteria before test generation.
2. It keeps a human decision point between model inference and automation.
3. It makes passing tests auditable through visual artifacts, rather than treating a green status as sufficient proof.
4. It supports comparison experiments across local and hosted models without making any provider mandatory.
5. It preserves the inspected project by generating all specs, logs, reports, screenshots, videos, and traces under `prototype-runs/`.

## Current Scope and Limitations

- The validation currently emphasizes safe smoke and interaction tests; richer domain assertions remain a planned evolution.
- Interactive MFA and CAPTCHA are not automated; a pre-established session may use the session-cookie adapter.
- Authenticated flows intentionally support navigation and observation rather than state-changing interactions.
- The current machine did not have an active Ollama or LM Studio model during the validation runs. Their adapters are implemented and covered by configuration tests, but the concrete E2E runs above used the local heuristic layer.
- Execution artifacts are intentionally ignored by Git because videos and traces are generated data. The run identifiers and file paths above make the local evidence directly traceable.

## Reproduction

```text
npm install
npx playwright install chromium
npm start
```

Open `http://127.0.0.1:4318`, select a project, review its criteria, generate the tests, then use **Run tests and collect evidence**. The results section presents the same evidence structure documented above.
