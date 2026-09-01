# Implementation Updates

## Evidence Quality, Coverage, and Independent Replay

Date: August 26, 2026

This update addresses the principal quality gaps found in the 20-application benchmark. Generated tests now compile exclusively from browser journeys that the selected model actually executed. The exploration record preserves raw accessible names, semantic element occurrences, tag positions, and real select-option values; every compiled interaction must pass an observed-locator contract before a test file is saved.

Flow planning is no longer deduplicated by terminal state. Distinct executed actions may produce the same interface fingerprint and still become separate model-authored flows. E2P derives an adaptive set of coverage opportunities from completed actions, reports covered and uncovered opportunities, and calibrates model confidence against changed-state evidence, assumptions, and criterion depth.

Potential-defect discovery now applies an evidence contract before conservative model review. Expectations based only on interface convention or model preference are rejected, ordinary content-availability assumptions require prior or documented evidence, and duplicate hypotheses are normalized semantically. Every retained guest hypothesis is then replayed in a clean browser context. Replay reports `observation-reproduced`, `observation-diverged`, or `reproduction-blocked`; it never converts the inferred requirement into an automatically confirmed defect.

Playwright failures are classified as `automation-locator`, `automation-generation`, `target-runtime`, `behavior-assertion`, `execution-timeout`, or `unclassified`. This prevents E2P automation defects from being counted as target-application findings. The UI exposes locator validation, adaptive flow coverage, screening counts, clean-session replay evidence, and failure classes.

The post-change automated regression suite passed **74/74 tests**. A five-repository public benchmark then completed 67 model-executed actions across 59 interface states. The two initial generated-automation failures were corrected and replayed successfully, and an expanded MDN Todo plan improved from one flow at 8% coverage to five passing flows at 42% coverage. The current evidence contract rejected all 25 initially retained target-defect hypotheses as unsupported or contradicted rather than reporting false findings. Full measurements and run paths are recorded in [`PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md`](PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md).

---

## Boundary-Probe Defect Trial and Confidence Audit

Date: August 24, 2026

This follow-up closes the evidence gap in the initial external evaluation. Fake Store, current TodoMVC React, and Movie Seat Booking completed comparable third-party trials, while a public historical TodoMVC revision produced one reproducible UI failure. E2P filled the creation field with one character, pressed Enter, observed no state change, compiled the model's expected outcome into Playwright, failed on the historical revision, and passed with the exact same test on the current revision.

Implementation changes include structured guest input values, general single-character boundary probes for creation fields without a declared minimum, refreshed catalogs for controls that become unavailable, objective unchanged-transition facts, terminal-action compilation, expected-text oracles, preserved author/reviewer confidence, four reviewer evidence gates, and an optional independent reviewer model.

The trial also establishes a limitation: the three current applications produced many retained false positives, including some with high reviewer confidence. Retention therefore remains `hypothesis`; only differential execution and human adjudication confirmed the historical TodoMVC defect. Full metrics and artifacts are in [`BUG_DISCOVERY_TRIAL_REPORT.md`](BUG_DISCOVERY_TRIAL_REPORT.md).

In the historical TodoMVC run, the model retained two medium-confidence hypotheses. Differential execution confirmed `Todo Item Creation`; human review rejected `Input Field Validation` because its immediate-feedback expectation was unsupported. The adjudication is preserved in `evaluation-results/bug-discovery/todomvc-single-character-adjudication.json`.

The complete post-change automated regression suite passed **59/59 tests**.

---

## Integrated Blind UI-Defect Discovery

Date: August 23, 2026

### Summary

This update turns the Dopa multimodal experiment into a reusable guest-pipeline capability. E2P now persists visual exploration states, asks the configured local vision model for structured defect hypotheses, validates every evidence reference, separates observed facts from inferred expectations, and uses a second conservative model role to reject likely false positives before presenting results.

### Implemented behavior

- Creates the run workspace before live exploration and reuses it through planning, test generation, execution, and result interpretation.
- Captures up to four viewport screenshots per distinct guest state; one focal screenshot is supplied to the model while the remaining tiles stay available for human review.
- Records before/after state IDs for every completed action.
- Enriches generic cart/favorite icon actions with the nearest card heading when available.
- Reviews each focal state together with immediate transition neighbors so cross-state inconsistencies remain visible without multiplying image input.
- Requires every hypothesis to contain reproducible steps, observed facts tied to real evidence IDs, an explicit expectation source, severity, confidence, and human-validation status.
- Rejects normal behavior and claims whose cited facts do not state the alleged anomaly.
- Adds a conservative critic role that attempts to falsify every surviving candidate; rejected candidates and reasons remain in the UI and JSON report.
- Adds a dedicated `Potential defects` UI panel with observed and inferred sections, screenshots, browser errors, critic reasoning, limitations, and report link.
- Adds `scripts/run-blind-local-evaluation.cjs` and `npm run evaluate:blind-local` for repeatable local evaluation of any target directory.
- Limits screenshot input to locally served vision models. Text-only models still receive structured UI evidence.
- Expands the local Ollama context and structured-output allowance to avoid truncation in rich plans.
- Compacts defect-review prompts so transition records do not duplicate complete page-control catalogs.
- Records repeated accessible-control occurrences and compiles them into unambiguous Playwright locators.

### External validation

- Target: `devamir99/fakestore-app`, commit `8e205db216ad16b370761e65274fad151b73f85e`.
- Model: `qwen2.5vl:7b` through local Ollama.
- Final run: `fakestore-app-2026-08-23T23-24-04-964Z`.
- Exploration: 20 actions, 11 states, 44 screenshots.
- Defect discovery: 11/11 state reviews completed, eight candidates, eight critic rejections, zero retained hypotheses, zero stage errors.
- Pipeline: one grounded flow, one generated Playwright test, 1/1 passed in 8.3 seconds.
- Browser UI check: new panel visible, expected empty state rendered, zero page JavaScript errors.
- Automated regression suite: **53 passed, 0 failed**.

### Affected areas

- Server/run lifecycle: `src/server.js`, `src/services/artifact-store.js`, `src/services/test-generator.js`.
- Model and exploration: `src/services/llm-provider.js`, `src/services/live-explorer.js`, `src/services/agentic-explorer.js`, `src/services/bug-discovery.js`.
- UI: `public/index.html`, `public/app.js`, `public/styles.css`.
- Evaluation and tests: `scripts/run-blind-local-evaluation.cjs`, `test/potential-defects.test.cjs`, `test/services.test.cjs`.
- Documentation: `README.md`, `specs.md`, `specs.bdd.md`, `features/bug-discovery.md`, `candidates.md`, `updates.md`, and `EXTERNAL_BLIND_EVALUATION_REPORT.md`.

### Interpretation

The final external run demonstrates that the complete workflow is reusable without target-specific flows or prior defect information. It does not claim that Fake Store is defect-free or that blind discovery has perfect recall. The eight rejected candidates show why conservative review and human judgment are necessary; reporting zero retained defects was the correct outcome for the evidence reached in this run. The run also exposed two E2P quality gaps, oversized repeated transition context and ambiguous repeated-link locators, both fixed and covered by regression tests.

---

## Adaptive Exploration and Grounded Planning Recovery

Date: August 16, 2026

### Summary

This update fixes two model-contract failures observed with Janvas and TodoMVC without introducing a heuristic fallback. E2P now treats a grounded action identifier as the source of execution truth, sizes exploration to observed interface complexity, accepts a smaller grounded flow set when other proposals are hallucinated, and keeps raw model diagnostics out of user-facing errors.

### Implemented behavior

- Accepts any model response with a valid current `actionId`, even when the model also returns an unsupported verb such as `explore`; E2P derives the safe canonical operation from the catalog.
- Keeps one correction attempt for genuinely missing or unknown identifiers, missing values, invalid select options, and unsafe choices.
- Replaces the apparent fixed 20-decision target with an adaptive action/time budget based on unique safe controls and discovered states. The former 20-action and 180-second values remain hard ceilings.
- Shows the current adaptive budget in the live viewer instead of presenting the ceiling as a required action count.
- Treats flow quantity as a coverage target rather than a validity quota. One grounded model-authored flow can proceed; zero admissible flows still stops the AI-first pipeline.
- Replaces raw JSON planning failures with concise rejected-flow examples and stores full payload diagnostics only in machine-readable evaluation results.
- Gives result interpretation one bounded semantic correction attempt and removes legacy heuristic wording from its objective context.
- Narrows provenance validation so genuine heuristic/deterministic claims still fail while accurate scope limitations do not become false positives.

### Real validations

- Janvas with `qwen3:8b`: completed, 6 model actions, 4 states, adaptive budget 12 of hard ceiling 20, 1 grounded flow, and 1/1 Playwright test passed.
- TodoMVC React with `qwen3:8b`: completed, 5 model actions, 4 states, adaptive budget 11 of hard ceiling 20, 3 grounded flows, and 3/3 Playwright tests passed.
- Both explorations ended through `safe-actions-exhausted`, not by consuming an arbitrary fixed decision count.
- Screenshots, videos, and traces were retained for the passing generated tests.
- Automated suite: **36 passed, 0 failed**.
- Dependency audit: **0 vulnerabilities**.

---

## Action Protocol and Live Exploration Viewer

Date: August 15, 2026

### Summary

This update removes the recurring `fill` versus `press` failure from model-guided exploration and makes the guest browser session observable from the E2P interface. It also strengthens flow grounding after a Janvas run exposed cross-project commerce vocabulary in otherwise passing tests.

### Implemented behavior

- Changed exploration decisions from redundant `actionId + kind` output to `actionId` selection. E2P now derives the canonical action kind from the current safe catalog.
- Preserved backward compatibility by ignoring a conflicting legacy kind and recording the protocol correction.
- Added one bounded semantic repair request to the same model for unknown IDs, missing values, or invalid options.
- Made Ollama structured calls reproducible with temperature zero and a fixed seed.
- Added a guest live viewer with compact screenshots, action rationale, expected result, route, headings, controls, and recent history.
- Kept authenticated previews disabled and omitted image bytes from historical operation events.
- Made the viewer expand only while exploration is active, collapse afterward, and remain reviewable on demand.
- Removed explanatory badges, the horizontal pipeline band, and model-participation cards from the workspace; all guidance now lives in the `About the workflow` modal.
- Removed static repository summaries from post-exploration flow planning.
- Added title/criterion vocabulary grounding and a model-only per-transition decomposition strategy when broad planning fails.
- Added rejection coverage for commerce flows proposed against Janvas evidence.

### Janvas validation

- The previous recurring failure at decision four no longer occurs.
- Through the real E2P UI, `qwen3:8b` completed six actions across four states in 22 seconds: `Start with Janvas`, `Canvas URL`, `Show`, `Press Enter in Canvas URL`, `Hide`, and `Privacy policy`.
- The viewer displayed each guest state live, collapsed after completion, and reopened with the final `/privacy` screenshot and a non-duplicated action history.
- Flow planning currently stops because `qwen3:8b` still proposes unobserved dashboard/tool concepts. E2P rejects these responses; no misleading tests are generated.
- The machine-readable result is retained in `evaluation-results/ai-first-candidates/janvas.json` and summarized in `AI_FIRST_CANDIDATE_REPORT.md`.

### Validation

- Automated suite: **34 passed, 0 failed**.
- Browser smoke: streamlined workspace, consolidated modal, live preview, automatic collapse, review toggle, and unlocked planning control verified.
- Dependency audit: **0 vulnerabilities**.

---

## AI-First Pipeline Realignment

Date: August 15, 2026

### Summary

This update realigns E2P with its primary research objective: evaluate a selected AI model across project understanding, live interface exploration, QA-flow and acceptance-criteria planning, test generation, execution, and result interpretation. The normal pipeline no longer substitutes heuristic flows or tests when the model fails. Instead, it stops at the failing stage and preserves objective partial evidence.

### Implemented behavior

- Added a central AI-first policy and made model configuration mandatory for semantic stages.
- Hid the non-AI comparison control unless E2P is explicitly started with `E2P_ENABLE_BASELINE_MODE=1`.
- Added one bounded structured-response correction attempt, followed by fail-fast behavior.
- Made live model-guided exploration mandatory before planning and generation.
- Expanded exploration to 20 actions or 180 seconds, with click, fill, select, Enter, popup, and same-origin CSS pointer support.
- Made invalid IDs, action-kind mismatches, unsafe choices, action failures, target failures, and runtime overlays stop exploration immediately while retaining partial states.
- Removed prewritten guest flow candidates from ordinary planning and required exact state evidence for model-proposed flows.
- Added causal action-to-state and flow-specific grounding checks to reject invented or unrelated criteria.
- Kept safe compilation only for exact journeys already selected and executed by the model; generic test fallback now stops generation.
- Rejected non-AI generation modes at the normal execution boundary.
- Made semantic result consolidation fail explicitly when its model call fails.
- Added a repeatable multi-candidate AI-first evaluator and machine-readable per-candidate results.

### Main files affected

- `src/services/pipeline-policy.js`
- `src/services/agentic-explorer.js`
- `src/services/live-explorer.js`
- `src/services/ai-workflows.js`
- `src/services/llm-provider.js`
- `src/services/test-generator.js`
- `src/server.js`
- `public/app.js`
- `public/index.html`
- `scripts/evaluate-candidates-ai-first.cjs`
- `test/services.test.cjs`
- `README.md`, `specs.md`, `specs.bdd.md`, `candidates.md`, and `AI_FIRST_CANDIDATE_REPORT.md`

### Validation evidence

- Dopa demonstrated one full 20-action, 15-state run with 2/2 passing tests, but its latest repetition stopped at decision two because the model requested `click` for a fill-only control. The contrast is retained as repeatability evidence.
- TodoMVC React completed five model actions across four states and passed 3/3 generated tests. The final pipeline status is nevertheless stopped because the model's result narrative contradicted the recorded AI-derived provenance.
- Janvas, Dopa, MDN To-do Notifications, Form Validator, and Movie Seat Booking stopped during their latest exploration when `qwen3:8b` violated the current action contract. They generated no fallback flows or tests, and their partial actions and exact stop reasons were retained.
- The full automated suite validates no-model rejection, malformed/invalid exploration rejection, invented-control rejection, action/state causality, sensitive-input blocking, model-journey compilation, authentication safety, runtime inference, and guest regression.
- Detailed current evidence is in [`AI_FIRST_CANDIDATE_REPORT.md`](AI_FIRST_CANDIDATE_REPORT.md) and `evaluation-results/ai-first-candidates/`.

---

## Authenticated Read-Only Flow Update

Date: August 11, 2026

## Summary

This update adds secure authenticated web-flow support to E2P while preserving the existing guest pipeline. Authentication values are resolved only by trusted server-side code from `E2P_AUTH_*` environment references. They are excluded from the browser UI, model context, generated tests, action plans, logs, reports, and artifacts.

Authenticated flows are limited to authentication, navigation, observation, assertions, and post-authentication screenshots. E2P does not create, change, publish, send, upload, or delete target data.

## Implemented behavior

- Added Guest and Authenticated/read-only access modes to the visible pipeline.
- Added Janvas Canvas token, session-cookie, form-login, and HTTP Basic adapters.
- Added profile-configuration checks that return status only.
- Added isolated authenticated Playwright contexts without persisted `storageState`.
- Added a constrained action schema for authenticated model output.
- Added a trusted authenticated executor that never runs credential-aware model JavaScript.
- Added same-origin, route-allowlist, unsafe-route, and HTTP-method enforcement.
- Added post-authentication screenshots while disabling traces, videos, network payloads, cookies, headers, and raw browser logs. Before capture, E2P checks the page URL, visible text, and visible non-protected form values for active credentials and suppresses unsafe evidence.
- Added run quarantine, secret scanning, and removal of files containing active secret values.
- Added execution-path validation so client-supplied run paths cannot escape `prototype-runs/<run-id>/results`.
- Restricted guest Playwright child environments and removed `E2P_AUTH_*` variables from target runtime processes.
- Added session, policy, evidence-policy, and secret-scan summaries to the UI and insights.
- Preserved the complete guest generation and execution path.

## Files affected

### New implementation files

- `src/services/auth-config.js`
- `src/services/auth-session.js`
- `src/services/read-only-policy.js`
- `src/services/authenticated-executor.js`
- `test/authentication.integration.test.cjs`
- `updates.md`

### Updated implementation files

- `src/server.js`
- `src/services/artifact-store.js`
- `src/services/live-explorer.js`
- `src/services/flow-planner.js`
- `src/services/ai-workflows.js`
- `src/services/test-generator.js`
- `src/services/test-runner.js`
- `src/services/runtime-orchestrator.js`
- `src/services/insight-builder.js`
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `test/services.test.cjs`
- `package.json` (`test:smoke` now runs the real browser integration suite instead of a missing file)
- `package-lock.json` (compatible transitive security updates applied by `npm audit fix`)

### Updated documentation

- `README.md`
- `specs.md`
- `specs.bdd.md`
- `features/auth.md`
- `candidates.md`
- `STATUS_REPORT.md`
- `OLLAMA_TOY_EXAMPLES_REPORT.md`

## Automated validation

Command:

```powershell
npm.cmd test
```

Result after implementation: **14 passed, 0 failed**. The dedicated `npm.cmd run test:smoke` command also passed **3 of 3** real-browser integration checks.

The suite validates:

- authentication-reference normalization and missing-field status;
- environment-only secret resolution and disposal;
- redaction and absence of secret values in public metadata;
- child and target process environment isolation;
- constrained action and route validation;
- authenticated flow planning;
- real Chromium authentication against a temporary protected application;
- blocking an automatic `POST` before it reaches the temporary server;
- authenticated screenshot evidence and secret scanning;
- suppression of visual evidence when a canary credential is rendered by the target;
- a full guest generation and Playwright execution regression.

Dependency audit: `npm.cmd audit --omit=dev` initially identified fixable transitive issues in `body-parser` and `undici`. A non-forced `npm.cmd audit fix` updated two packages, after which the audit reported **0 vulnerabilities**.

### Guest regression through the E2P HTTP service

The unchanged guest path was also exercised through a real E2P server instance, rather than only through direct service calls. A disposable public target was passed to `/api/tests/generate` and `/api/tests/run` with `mode: guest`.

- run ID: `action-e2e-prototype-2026-08-11T22-38-45-149Z`;
- result: **1 passed, 0 failed**;
- duration: 1.1 seconds;
- evidence: screenshot, video, and trace;
- authentication data: none.

This confirms that the authenticated executor branch did not replace or degrade the existing Playwright CLI path used for public applications.

## E2P platform validation with Janvas

Run ID: `canvas-wrapper-test-2026-08-11T22-45-34-579Z`

The validation used the Janvas deterministic acceptance provider and a random runtime-only canary supplied through an environment reference. It did not use a real institutional credential. The target development server was supervised independently and supplied to E2P as an external local URL after one command-mode attempt exposed a transient target-process shutdown between routes.

| Measurement | Result |
| --- | --- |
| Auth profile configured | Yes |
| Authenticated live exploration | Completed |
| Session verification | Verified |
| Read-only routes | `/profile`, `/inbox` |
| Generated constrained plans | 2 |
| Passed | 2 |
| Failed | 0 |
| Duration | 3.2 seconds |
| Screenshots | 2 |
| Delivered mutating requests | 0 |
| Blocked requests | 2 external image requests |
| Secret scan | Passed across 15 files |
| Artifact quarantine | Released after scan |
| Trace/video | Disabled by policy |

The evidence files show the authenticated Janvas profile and inbox fixtures. No compose, send, submit, comment, create-group, upload, publish, or delete action was performed.

## UI validation

The E2P interface was opened in a real browser after the change. The eight-stage pipeline, Access mode card, adapter-specific fields, read-only banner, and configuration-status action rendered correctly. A process environment reference was recognized as `Configured / read-only`, and no browser-console errors were reported.

## Known boundaries

- Interactive MFA and CAPTCHA are not automated; a permitted pre-established session can use the session-cookie adapter.
- Authenticated action plans intentionally omit general clicks and form filling.
- Authenticated screenshots can contain private target content. E2P suppresses capture when an active credential is found in the URL, visible text, or a visible non-protected form value, but evidence retention still requires evaluator care.
- Traces and videos remain disabled because they may contain reusable session or request data.
- Explicit allowlists reduce but cannot mathematically prove the absence of side effects in a target application whose `GET` endpoints mutate data.
