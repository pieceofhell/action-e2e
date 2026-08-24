# Action E2E Prototype

Local prototype for experimenting with an action-oriented AI-assisted E2E test generation and execution pipeline.

## Goal

This application was built to validate, in a first practical slice, the methodology defined in the paper. The prototype allows users to:

- select a local project;
- inspect the README, structure, manifests, and relevant files;
- propose primary user flows and acceptance criteria;
- manually approve the proposed flows;
- generate automated E2E tests with Playwright;
- execute the tests and consolidate results and insights;
- discover evidence-grounded potential UI defects during guest exploration;
- separate observed facts from inferred expectations and preserve rejected false-positive candidates;
- follow long-running work through live phases, progress, elapsed time, and recent milestones;
- choose between guest and authenticated read-only flows;
- resolve authentication material from server-side environment references without exposing values to the browser or model;
- choose which model layer will be used for semantic refinement;
- talk directly to the selected model through a contextual pipeline console.

## Architecture Summary

- `src/server.js`: local Express server and API.
- `src/services/project-inspector.js`: evidence-only repository inspection.
- `src/services/agentic-explorer.js`: model-selected browser actions, adaptive exploration, state transitions, and viewport evidence.
- `src/services/bug-discovery.js`: blind defect hypotheses, evidence validation, and conservative model review.
- `src/services/llm-provider.js`: integration with local or remote model providers.
- `src/services/ai-workflows.js`: model-assisted refinement during inspection, flow planning, and insight generation.
- `src/services/ai-console.js`: conversational console connected to the selected provider.
- `src/services/flow-planner.js`: flow and acceptance-criteria generation.
- `src/services/test-generator.js`: Playwright artifact generation.
- `src/services/test-runner.js`: target-project startup and test execution.
- `src/services/auth-config.js`: authentication metadata, environment-backed secret resolution, redaction, and subprocess isolation.
- `src/services/auth-session.js`: trusted Janvas, session-cookie, form-login, and HTTP Basic adapters.
- `src/services/read-only-policy.js`: authenticated action validation and browser-network mutation blocking.
- `src/services/authenticated-executor.js`: constrained Playwright execution and post-authentication evidence capture.
- `src/services/pipeline-policy.js`: AI-first stage requirements and explicit experimental-control policy.
- `src/services/insight-builder.js`: objective execution measurements supplied to model-based consolidation.
- `src/services/operation-tracker.js`: bounded in-memory progress and milestone tracking for long-running operations.
- `public/`: local graphical interface.
- `prototype-runs/`: artifacts generated per run without destructively changing the inspected project.

### Live operation feedback

The workspace includes a lightweight sticky activity monitor that remains visible while the evaluator moves through the page. Project inspection, target startup, live exploration, flow planning, model requests, test generation, execution, and evidence consolidation publish real server-side milestones through an operation identifier. During guest exploration, the monitor expands into a live viewer with a compact screenshot, the current model decision, rationale, expected result, observed route and controls, and recent action history. It collapses after completion and can be reopened with `Review exploration`. Authenticated previews remain disabled to protect private content.

All explanatory badges, pipeline descriptions, and model-participation cards are consolidated in the accessible `About the workflow` modal so the working surface stays focused on the experiment.

Operation records are temporary, bounded, held only in server memory, and contain curated status messages rather than target-process output or credential material.

## Detailed Specifications

- [`specs.md`](specs.md): end-to-end system behavior, architecture, technology rationale, API contracts, safety boundaries, artifacts, and extension guidance.
- [`specs.bdd.md`](specs.bdd.md): user and engineering flows in Given/When/Then form, including model-selection guidance and evaluation scenarios.
- [`candidates.md`](candidates.md): candidate toy applications, selection rationale, comparable E2P runs, evidence, and cross-project findings.
- [`features/auth.md`](features/auth.md): authenticated read-only architecture, security controls, pipeline behavior, and validation evidence.
- [`features/bug-discovery.md`](features/bug-discovery.md): defect-discovery architecture, historical POC, implemented pipeline, and evaluation evidence.
- [`EXTERNAL_BLIND_EVALUATION_REPORT.md`](EXTERNAL_BLIND_EVALUATION_REPORT.md): complete unknown-project run and interpretation.
- [`updates.md`](updates.md): implementation summary, affected files, and tests for the authenticated-flow update.

## How To Run

```bash
npm install
npx playwright install chromium
npm start
```

Then open [http://127.0.0.1:4318](http://127.0.0.1:4318).

Run all tests with `npm.cmd test`, or run only the real-browser guest/authenticated integration checks with `npm.cmd run test:smoke`.

Run the repeatable blind local evaluation from the command line with:

```bash
npm.cmd run evaluate:blind-local -- "C:\path\to\web-project" "qwen2.5vl:7b" "gemma3:12b"
```

The third model argument is the author/explorer; the optional fourth argument is an independent reviewer. The same capability is available in the UI through `Reviewer model (optional)`: load a guest project, run `Explore live interface`, and review `Potential defects`. The report keeps candidate hypotheses, author and reviewer confidence, evidence-gate decisions, screenshots, reproduction steps, browser console/page errors, severity, and explicit observed-versus-expected sections under `prototype-runs/<run-id>/results/potential-bugs.json`.

See [`BUG_DISCOVERY_TRIAL_REPORT.md`](BUG_DISCOVERY_TRIAL_REPORT.md) for the three-application trial, the confirmed historical TodoMVC failure, the exact red/green Playwright control, and the measured false-positive limitation.

### Authenticated read-only runs

Authentication values are never entered in the E2P page. Configure them in the process environment or inject them through the secret facility used to launch E2P, then enter only the environment-variable **name** in the UI. Authentication references must start with `E2P_AUTH_`.

Supported adapters:

- `Janvas Canvas token`: resolves one token reference and prepares the Janvas HttpOnly cookies directly in an isolated context.
- `Session cookie`: resolves one session-cookie reference for applications or SSO/MFA handoffs that already provide a session value.
- `Form login`: resolves separate username and password references and uses user-confirmed selectors and authentication endpoints.
- `HTTP Basic`: resolves separate username and password references through Playwright's trusted context configuration.

For a Janvas run, configure a token reference before starting E2P, select `Authenticated / read-only`, choose the Janvas adapter, enter the reference name, and allowlist only the protected routes that may be observed. The UI's `Check secret configuration` action returns only `configured` or missing-field status; it never returns the value.

Authenticated execution is intentionally more restrictive than guest execution:

- the model produces a schema-constrained action plan rather than unrestricted credential-aware JavaScript;
- only navigation, assertions, and screenshot capture are accepted;
- non-read HTTP methods, external origins, unsafe route semantics, and non-allowlisted document paths are blocked;
- traces, videos, headers, cookies, request payloads, and raw browser logs are disabled;
- screenshots are suppressed if the current URL, visible text, or a visible non-protected form value contains an active credential;
- artifacts stay quarantined until a byte-level secret scan passes.

## Providers And Models

The normal E2P workflow is AI-first. A configured model is required for semantic inspection, live action selection, flow and criteria planning, test generation, and result interpretation.

- `Local Ollama`: for models served locally, including the evaluated `llama3.1:8b`, `qwen3:8b`, `qwen2.5-coder:7b`, and `gemma3:12b` profiles.
- `Local LM Studio`: for a model loaded locally and exposed through LM Studio's OpenAI-compatible server.
- `OpenRouter`, `Groq`, `Together AI`, and `Hugging Face Inference Providers`: preset hosted endpoints; the user supplies a model identifier and the required API key.
- `Custom OpenAI-compatible endpoint`: for another local or remote server that supports `chat/completions`.

Important notes:

- the prototype does not load model weights directly; it talks to a local or remote runtime;
- Local Ollama is the default provider and `qwen3:8b` is preferred when installed;
- if the desired model does not appear in the dropdown, it can be typed manually;
- repository and DOM collectors provide evidence but do not make semantic QA decisions;
- if a required model stage fails, the pipeline stops and reports the exact stage, reason, and partial evidence;
- a non-AI control exists only for maintainers who deliberately start E2P with `E2P_ENABLE_BASELINE_MODE=1`; it is hidden otherwise and is never an automatic fallback.

## How The Model Participates In The Pipeline

- `Project inspection`: the local parser collects README, structure, manifests, routes, components, and UI hints; the model refines the summary, persona, and main capabilities.
- `Live exploration`: Playwright exposes action identifiers and current UI evidence; the model chooses the target action while E2P derives its canonical `click`, `fill`, `select`, or `press` operation from the safe catalog. A valid identifier remains authoritative even when the model invents or repeats a conflicting verb. One genuinely invalid decision may be corrected by the same model before fail-fast interruption. The active action and time budgets adapt to discovered controls and states, with 20 actions and 180 seconds retained only as hard safety ceilings.
- `Potential-defect discovery`: a local vision model reviews one focal screenshot plus structured before/after states. A separate conservative reviewer attempts to falsify each candidate. Normal empty states, claims unsupported by cited facts, and candidates contradicted by visible feedback are rejected and retained only in the false-positive record.
- `Flows and criteria`: the model proposes QA journeys from live states only. Cross-project vocabulary is rejected, and a failed broad plan may be decomposed into model-authored flows for individual executed transitions.
- `Test rendering`: once the user approves the flows, the selected model can author the Playwright body. Invalid free-form code is rejected; when an executed model journey exists, E2P can compile that verified sequence into constrained Playwright rather than silently reducing it to a smoke test.
- `Results and insights`: execution data remains objective and local; the model only synthesizes interpretation, limitations, and next steps.
- `Model console`: the user can ask free-form questions to the same selected provider using a compact context built from the current project and pipeline state.

## End-To-End Flow

1. Select or paste the path to a local web project.
2. Choose the model layer that will be used for semantic refinement.
3. Load the project so the prototype can read the README, structure, manifests, and relevant files.
4. Review the automatic system summary, including framework, language, archetype, and suggested execution strategy.
5. Choose guest mode or configure an authenticated read-only profile.
6. Explore the rendered interface with the selected access mode.
7. Review potential defects, their observed facts, inferred expectations, screenshots, and rejected candidates.
8. Generate primary flows and acceptance criteria.
9. Manually approve the desired flows and review the generated criteria.
10. Adjust execution mode, startup command, and base URL when necessary.
11. Generate and run the tests, then review the available artifacts.

## Example Usage

A simple demonstration scenario is to point the prototype at a static web application. In that case, the system tends to:

- classify the project as `static`;
- serve the application through a temporary internal server;
- generate smoke tests centered on rendering, primary actions, and interface flows;
- consolidate the results under `prototype-runs/<run-id>/`.

## How The Prototype Connects To The Paper Methodology

This first version implements, in software, the methodological pipeline discussed in the paper:

- `project selection`: explicit choice of the target repository;
- `inspection and understanding`: reading the README, files, and interface signals;
- `flow proposal`: inference of plausible user journeys;
- `acceptance-criteria generation`: transformation of flows into structured criteria;
- `human review`: manual approval before execution;
- `test generation`: automated creation of Playwright artifacts;
- `execution`: target-project startup and test run;
- `insights`: consolidation of results, limitations, and next steps.

## Generated Artifacts

Each execution creates its own directory under `prototype-runs/`, containing:

- `inspection.json`
- `exploration.json`
- `approved-flows.json`
- `runtime-config.json`
- `generated-tests.json`
- guest runs: `playwright.config.cjs` and `tests/*.spec.cjs`
- authenticated runs: `auth-metadata.json` and `tests/*.actions.json`
- `results/playwright-results.json`
- `results/potential-bugs.json`
- `results/blind-evaluation.json` when the repeatable evaluator is used
- `results/stdout.log`
- `results/stderr.log`
- `results/visual-evidence.json`
- guest evidence: trace, video, and screenshot when Playwright can start the browser
- authenticated evidence: post-authentication screenshots and `results/auth-execution.json` after secret scanning

## Visual Evidence Review

The execution result contains a visual evidence gallery. Each generated test is associated with the artifacts Playwright produced:

- `screenshot`: a browser image captured at the end of the test;
- `video`: the complete browser interaction recording;
- `trace`: a Playwright trace that can be opened with `npx playwright show-trace <trace.zip>`.

This keeps the human reviewer in the loop after generation: passing tests are not treated as opaque success signals, because their exercised interface state can be inspected directly from the prototype.

Authenticated runs deliberately retain fewer evidence types. They keep screenshots captured only after session preparation and omit traces and videos because those formats may retain reusable cookies, request bodies, or headers. The result displays session verification, blocked-request count, evidence policy, and secret-scan status.

## Validation Targets Used During Development

The current AI-first build was validated through the prototype itself with deliberately different targets:

- `pieceofhell/canvas-wrapper-test` (Janvas): a Next.js Canvas wrapper started by a local command. In the latest guest AI-first run, `qwen3:8b` completed six actions across four states, produced one admissible privacy-policy journey, and passed 1/1 generated test. Invented dashboard/tool flows were rejected instead of replacing the grounded journey. A separate historical authenticated read-only run passed 2/2 constrained flows without exposing credentials.
- [MDN To-do Notifications](https://github.com/mdn/dom-examples/tree/main/to-do-notifications): a static, form-centric task application. Its latest run retained six completed model actions before stopping on an invalid current action ID.
- `Dopa`: a Vinext/TypeScript fictional shopping showcase. One `qwen3:8b` run completed 20 actions across 15 states and passed 2/2 evidence-grounded journeys, while the latest repetition stopped at decision two on an action-kind mismatch. This exposes model repeatability as a measured limitation.
- `TodoMVC React`: a stateful CRUD application. The latest model run completed five actions across four states, generated three evidence-grounded journeys, passed 3/3 tests, and completed result interpretation.

These cases exercise both supported runtime modes (`command` and `static`) and demonstrate that the generated artifacts stay outside the inspected repositories. Current per-candidate results and exact interruption reasons are recorded in [`AI_FIRST_CANDIDATE_REPORT.md`](AI_FIRST_CANDIDATE_REPORT.md); earlier multi-model experiments remain in [`MODEL_EVALUATION_REPORT.md`](MODEL_EVALUATION_REPORT.md).

## Supported Execution Strategies

- `static`: for static projects with `index.html`.
- `command`: for projects with a local startup command such as `npm run dev`.
- `external`: for applications already running outside the prototype.
- `manual`: analysis only, without execution.

### Automatic Runtime Suggestions

When a project is loaded, the prototype automatically proposes the execution mode, package manager, install command, start command, base URL, and working directory. These values are derived from actual project evidence: lockfiles, `package.json` scripts, framework conventions, explicit ports in scripts, and README instructions.

Command startup also reads loopback URLs announced by development servers and probes equivalent `localhost`, IPv4, and IPv6 addresses. Cold starts are allowed up to three minutes because modern development servers such as Vinext may compile for more than one minute. If startup fails or exits early, E2P terminates the process tree and returns sanitized startup diagnostics instead of leaving an orphan process.

For monorepos, the selected web manifest can be nested. For example, a detected `apps/web/package.json` is executed with `apps/web` as the working directory instead of incorrectly running the command at the repository root. The selected model contributes to the semantic inspection, but it does not invent shell commands: the commands remain restricted to evidence found in the inspected project. All fields stay visible and editable, and installation remains opt-in.

## Current Scope

This first version prioritizes robustness and demonstrability:

- focus on web applications;
- Playwright as the default E2E tool;
- bounded stateful exploration and evidence-grounded journey generation;
- human review before test generation;
- authenticated read-only flows with environment-backed secret references;
- trusted adapters and constrained action plans for protected routes;
- model-required semantic interpretation and action selection;
- fail-fast behavior with preserved partial evidence when a model or required runtime stage fails.

## Known Limitations

- different models may vary in how reliably they follow the expected JSON format;
- SSO, CAPTCHA, and interactive MFA may require a pre-established session-cookie adapter or manual preparation outside E2P;
- authenticated flows are navigation-and-observation only and intentionally do not click state-changing controls;
- the quality of generated tests depends on the richness of the signals found in the project;
- local models can still choose weak actions, return malformed JSON, or produce code that fails structural validation; the pipeline stops and preserves those outcomes instead of presenting fallback output as model success;
- videos and traces increase guest-run storage; they remain disabled for authenticated runs until a safe redaction audit is available.
