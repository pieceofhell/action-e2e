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
- `src/services/hypothesis-reproducer.js`: clean-session replay of retained UI observations without promoting an inferred expectation to a confirmed defect.
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
- [`PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md`](PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md): five-repository public benchmark, aggregate evidence, corrections, and remaining limits.
- [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md): compact cross-machine context covering research continuity, implementation state, evidence, known weaknesses, and next steps.
- [`updates.md`](updates.md): implementation summary, affected files, and tests for the authenticated-flow update.

## Reproduce E2P From a Fresh Machine

### Prerequisites

| Requirement | Reproducible baseline |
| --- | --- |
| Operating system | Windows 11 was used for the recorded experiments. The application code is portable, but the native folder dialog is Windows-specific. |
| Git | Any current Git release capable of cloning the repositories below. |
| Node.js | Node.js 24 is recommended. The current validation used Node.js `24.15.0`; Playwright currently supports the latest 22.x, 24.x, and 26.x releases. |
| Browser runtime | Chromium installed through the project's Playwright dependency. Firefox may be used to open the E2P interface, but generated execution currently targets Chromium. |
| AI runtime | Ollama is the reproducible local provider used by the public benchmark. Other supported providers are described later. |
| Storage | Allow space for `node_modules`, Playwright Chromium, target-project dependencies, run videos/traces, and local model files. The benchmark model pair occupies approximately 14 GB before runtime overhead. |

Official downloads: [Git](https://git-scm.com/downloads), [Node.js](https://nodejs.org/en/download/), [Ollama for Windows](https://docs.ollama.com/windows), and [Playwright installation guidance](https://playwright.dev/docs/intro).

### Clone and install E2P

```powershell
git clone https://github.com/pieceofhell/action-e2e.git
cd action-e2e
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd test
```

Use `npm.cmd` and `npx.cmd` on Windows if PowerShell reports that `npm.ps1` cannot be loaded because script execution is disabled. This invokes the same Node.js tools without changing the machine's execution policy. On another shell, ordinary `npm` and `npx` are equivalent.

The expected project self-test result for this revision is **74 passed, 0 failed**.

### Install and start the local models

Install Ollama with its Windows installer, then open the Ollama application. It normally stays available in the background at `http://127.0.0.1:11434`. If using the standalone CLI instead, start it with `ollama serve` in a separate terminal.

Pull the exact pair used for the five-public-repository benchmark:

```powershell
ollama pull qwen2.5vl:7b
ollama pull gemma3:12b
ollama list
```

`qwen2.5vl:7b` is the author/explorer and receives the locally captured screenshot when visual review is available. `gemma3:12b` is the independent conservative reviewer. The Ollama library currently lists the selected Qwen model at approximately 6.0 GB and Gemma at approximately 8.1 GB. Machines with less available memory may use `qwen2.5vl:3b` and `gemma3:4b`, but those substitutions are not the same experimental condition and their results must be reported separately.

Optional comparison models used in earlier experiments can be installed with:

```powershell
ollama pull qwen3:8b
ollama pull llama3.1:8b
ollama pull qwen2.5-coder:7b
```

### Start E2P

```powershell
npm.cmd start
```

Open [http://127.0.0.1:4318](http://127.0.0.1:4318). `index.html` should not be opened directly because the interface depends on the local E2P server for project inspection, model calls, target startup, artifacts, and operation progress.

### Complete one run through the UI

1. Keep Ollama running and confirm that the model names appear under `Selectable model`.
2. Select `Local Ollama`, choose `qwen2.5vl:7b`, and set `Reviewer model (optional)` to `gemma3:12b`.
3. Use `Choose folder in Windows` or paste an absolute target-project directory, then select `Load project`.
4. Review the detected framework, working directory, installation command, startup command, and base URL. Correct a value only when the target documentation requires it.
5. Keep `Guest` access for the public benchmark and select `Explore live interface`.
6. Follow the sticky live viewer as the model chooses actions and E2P records states. The AI-first pipeline stops instead of silently substituting a heuristic plan when a required model stage fails.
7. Review observed facts, inferred expectations, rejected hypotheses, and clean-session replay status under `Potential defects`.
8. Select `Generate flows and criteria`, inspect semantic coverage, and approve only the flows that are appropriate for the experiment.
9. Select `Generate Playwright tests`, followed by `Run tests and collect evidence`.
10. Review pass/fail status, failure classification, screenshots, videos, traces, limitations, and final model interpretation.

Every run is isolated under `prototype-runs/<run-id>/`; E2P does not need to write generated tests into the selected target repository.

### Repeat a run from the command line

Preinstall the target project's dependencies, ensure any required companion process is running, and execute:

```powershell
npm.cmd run evaluate:blind-local -- "C:\path\to\web-project" "qwen2.5vl:7b" "gemma3:12b"
```

The positional arguments are target directory, author/explorer model, and optional reviewer model. The evaluator performs inspection, guest exploration, finding review, flow planning, generation, execution, and insight consolidation. Its machine-readable summary is stored at `prototype-runs/<run-id>/results/blind-evaluation.json`; finding details are stored in `results/potential-bugs.json`.

See [`BUG_DISCOVERY_TRIAL_REPORT.md`](BUG_DISCOVERY_TRIAL_REPORT.md) for the historical red/green control and [`PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md`](PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md) for the five-project unknown-application trial.

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

- `Local Ollama`: the reproducible benchmark provider. The latest public trial used `qwen2.5vl:7b` for exploration and authorship plus `gemma3:12b` for independent review. Earlier comparisons used `llama3.1:8b`, `qwen3:8b`, and `qwen2.5-coder:7b`.
- `Local LM Studio`: for a model loaded locally and exposed through LM Studio's OpenAI-compatible server.
- `OpenRouter`, `Groq`, `Together AI`, and `Hugging Face Inference Providers`: preset hosted endpoints; the user supplies a model identifier and the required API key.
- `Custom OpenAI-compatible endpoint`: for another local or remote server that supports `chat/completions`.

Important notes:

- the prototype does not load model weights directly; it talks to a local or remote runtime;
- Local Ollama is the default provider; explicitly select `qwen2.5vl:7b` to reproduce the current public benchmark rather than relying on the UI's convenience default;
- if the desired model does not appear in the dropdown, it can be typed manually;
- repository and DOM collectors provide evidence but do not make semantic QA decisions;
- if a required model stage fails, the pipeline stops and reports the exact stage, reason, and partial evidence;
- a non-AI control exists only for maintainers who deliberately start E2P with `E2P_ENABLE_BASELINE_MODE=1`; it is hidden otherwise and is never an automatic fallback.

## How The Model Participates In The Pipeline

- `Project inspection`: the local parser collects README, structure, manifests, routes, components, and UI hints; the model refines the summary, persona, and main capabilities.
- `Live exploration`: Playwright exposes action identifiers and current UI evidence; the model chooses the target action while E2P derives its canonical `click`, `fill`, `select`, or `press` operation from the safe catalog. A valid identifier remains authoritative even when the model invents or repeats a conflicting verb. One genuinely invalid decision may be corrected by the same model before fail-fast interruption. The active action and time budgets adapt to discovered controls and states, with 20 actions and 180 seconds retained only as hard safety ceilings.
- `Potential-defect discovery`: a local vision model reviews one focal screenshot plus structured before/after states. A separate conservative reviewer attempts to falsify each candidate. Normal empty states, claims unsupported by cited facts, and candidates contradicted by visible feedback are rejected and retained only in the false-positive record.
- `Flows and criteria`: the model proposes QA journeys from live states only. Cross-project vocabulary is rejected, and a failed broad plan may be decomposed into model-authored flows for individual executed transitions.
- `Test rendering`: once the user approves the flows, E2P compiles constrained Playwright from the journey the selected model actually executed. Every interaction must satisfy the observed-locator contract; no unrelated free-form model code or heuristic smoke test silently replaces the model journey.
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
8. Check clean-session replay status and distinguish target behavior assertions from generated-automation failures.
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

## Public Validation Corpus

The following public repositories were exercised during development. Dopa and the later local 20-application collection are intentionally excluded from this reproducibility corpus because they are not independent public targets. A revision records the local snapshot used by the corresponding report; upstream repositories may have changed since that run.

| Target | Repository and recorded revision | Directory selected in E2P | Setup before an E2P run |
| --- | --- | --- | --- |
| Janvas | [`pieceofhell/canvas-wrapper-test`](https://github.com/pieceofhell/canvas-wrapper-test), `be5b2f8b4e4215bc31790a5cc5528858aabffbf0` | Repository root; E2P resolves `apps/web` | Install the monorepo dependencies. Guest mode needs no Canvas token; authenticated reproduction requires an independently supplied environment secret and is documented in `features/auth.md`. |
| MDN To-do Notifications | [`mdn/dom-examples`](https://github.com/mdn/dom-examples), `5419e769b8cae4f94e6634668cdaa3c33b0127cb` | `to-do-notifications` | No dependency installation; use static mode. |
| TodoMVC React | [`tastejs/todomvc`](https://github.com/tastejs/todomvc), current control `ff43b02e59dfa604386bb382034b2cd07c2bcd8a` | `examples/react` | Install dependencies in the selected example when required by that revision. Historical control revisions are documented in `BUG_DISCOVERY_TRIAL_REPORT.md`. |
| Form Validator and Movie Seat Booking | [`bradtraversy/vanillawebprojects`](https://github.com/bradtraversy/vanillawebprojects), `adc66a181a67049fb413c8862181ddc6c45ba22b` | `form-validator` or `movie-seat-booking` | No dependency installation; use static mode. |
| Fake Store | [`devamir99/fakestore-app`](https://github.com/devamir99/fakestore-app), `8e205db216ad16b370761e65274fad151b73f85e` | Repository root | Run `npm install`; E2P uses the detected Vite command. |
| Anon eCommerce | [`codewithsadee/anon-ecommerce-website`](https://github.com/codewithsadee/anon-ecommerce-website), `28181229be9973f9c5dc77ce1e07af08b8ab3d91` | Repository root | No dependency installation; use static mode. |
| Build a Quiz App | [`jamesqquick/Build-A-Quiz-App-With-HTML-CSS-and-JavaScript`](https://github.com/jamesqquick/Build-A-Quiz-App-With-HTML-CSS-and-JavaScript), `ef07bc7c4baa51bad8eb44727895a5dd667e41dc` | `Quiz App Master` | No dependency installation; use static mode. Do not select the tutorial collection root. |
| Cypress Kitchen Sink | [`cypress-io/cypress-example-kitchensink`](https://github.com/cypress-io/cypress-example-kitchensink), `ae5284ece83008b5f9ac1982201d38a82c3a1420` | Repository root | Run `npm ci`; detected command is `npm start`, normally at port 8080. |
| MDN Todo React | [`mdn/todo-react`](https://github.com/mdn/todo-react), `f7a0866a347655ba10fd2f43f5c9c0c62ca54f73` | Repository root | Run `npm install`; detected command is `npm run dev`, normally at port 3000. |
| The React Quiz | [`TheNarh/The-React-Quiz`](https://github.com/TheNarh/The-React-Quiz), `a7c9ef43e703d23fe7605a224bf28431d78c9fba` | Repository root | Run `npm ci`, start `npm run server` in a separate terminal, and let E2P start `npm run start`. |

### Clone the five-project public benchmark

```powershell
New-Item -ItemType Directory -Force "$HOME\Documents\e2p-public-benchmark" | Out-Null
Set-Location "$HOME\Documents\e2p-public-benchmark"

git clone https://github.com/codewithsadee/anon-ecommerce-website.git anon-ecommerce-website
git clone https://github.com/jamesqquick/Build-A-Quiz-App-With-HTML-CSS-and-JavaScript.git javascript-quiz
git clone https://github.com/cypress-io/cypress-example-kitchensink.git cypress-kitchensink
git clone https://github.com/mdn/todo-react.git mdn-todo-react
git clone https://github.com/TheNarh/The-React-Quiz.git react-quiz

git -C anon-ecommerce-website checkout 28181229be9973f9c5dc77ce1e07af08b8ab3d91
git -C javascript-quiz checkout ef07bc7c4baa51bad8eb44727895a5dd667e41dc
git -C cypress-kitchensink checkout ae5284ece83008b5f9ac1982201d38a82c3a1420
git -C mdn-todo-react checkout f7a0866a347655ba10fd2f43f5c9c0c62ca54f73
git -C react-quiz checkout a7c9ef43e703d23fe7605a224bf28431d78c9fba

npm.cmd --prefix cypress-kitchensink ci
npm.cmd --prefix mdn-todo-react install
npm.cmd --prefix react-quiz ci
```

For The React Quiz, keep this companion process running during exploration and execution:

```powershell
Set-Location "$HOME\Documents\e2p-public-benchmark\react-quiz"
npm.cmd run server
```

The exact target directories are the five clone roots except for Build a Quiz App, whose target is `javascript-quiz\Quiz App Master`. Dependency installation was completed before the recorded benchmark and E2P's `Run install before execution` option remained off so setup time would not be mixed with model evaluation.

The original five full runs recorded 67 model actions and 59 interface states. After general compiler corrections, all five original scenarios passed; an expanded MDN Todo plan passed 5/5 tests at 42% observed-opportunity coverage. No target defect was confirmed in that sample. All 25 initially retained hypotheses were rejected by the current evidence contract as unsupported or contradicted. This is documented without inflating model performance in [`PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md`](PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md).

Earlier per-candidate results remain in [`candidates.md`](candidates.md), [`AI_FIRST_CANDIDATE_REPORT.md`](AI_FIRST_CANDIDATE_REPORT.md), [`EXTERNAL_BLIND_EVALUATION_REPORT.md`](EXTERNAL_BLIND_EVALUATION_REPORT.md), and [`MODEL_EVALUATION_REPORT.md`](MODEL_EVALUATION_REPORT.md).

## Supported Execution Strategies

- `static`: for static projects with `index.html`.
- `command`: for projects with a local startup command such as `npm run dev`.
- `external`: for applications already running outside the prototype.
- `manual`: analysis only, without execution.

### Automatic Runtime Suggestions

When a project is loaded, the prototype automatically proposes the execution mode, package manager, install command, start command, base URL, and working directory. These values are derived from actual project evidence: lockfiles, `package.json` scripts, framework conventions, explicit ports in scripts, and README instructions.

Command startup also reads loopback URLs announced by development servers and probes equivalent `localhost`, IPv4, and IPv6 addresses. Cold starts are allowed up to three minutes because modern development servers such as Vinext may compile for more than one minute. If startup fails or exits early, E2P terminates the process tree and returns sanitized startup diagnostics instead of leaving an orphan process.

For monorepos, the selected web manifest can be nested. For example, a detected `apps/web/package.json` is executed with `apps/web` as the working directory instead of incorrectly running the command at the repository root. The selected model contributes to the semantic inspection, but it does not invent shell commands: the commands remain restricted to evidence found in the inspected project. All fields stay visible and editable, and installation remains opt-in.

## Common Problems

| Symptom | Resolution |
| --- | --- |
| PowerShell says `npm.ps1` cannot be loaded | Use `npm.cmd` and `npx.cmd`, as shown in this README. |
| E2P reports that the Ollama provider is unavailable | Open the Ollama Windows application or run `ollama serve`, then confirm `ollama list` works before refreshing E2P. |
| A selected model does not appear | Pull it with `ollama pull <model>` and reload the E2P page, or enter the exact runtime model name manually. |
| Port 4318 is already occupied | Stop the previous E2P terminal with `Ctrl+C`. If its terminal is unavailable, identify the process that owns port 4318 before ending that specific process. |
| Target URL does not respond | Preinstall target dependencies, verify the detected working directory and start command, and check whether the target needs a companion process such as The React Quiz JSON server. |
| Exploration stops on an invalid or unavailable action | Keep the partial evidence. E2P intentionally fails fast after its bounded model repair attempt; retrying is a new model trial and should be recorded as such. |
| Planning produces no admissible flow | Inspect the completed states and action evidence. The model may have proposed unrelated vocabulary or unsupported behavior, which E2P rejects rather than replacing. |
| A generated test fails | Check the displayed failure class before treating it as target behavior. Locator, generation, startup, assertion, and timeout failures have different meanings. |
| A trace needs manual inspection | Run `npx.cmd playwright show-trace "<absolute-path-to-trace.zip>"`. |

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
- repeated runs with the same model can explore different actions, so model name, target revision, timestamps, action/state counts, and stop reasons must be retained;
- SSO, CAPTCHA, and interactive MFA may require a pre-established session-cookie adapter or manual preparation outside E2P;
- authenticated flows are navigation-and-observation only and intentionally do not click state-changing controls;
- the quality of generated tests depends on the richness of the signals found in the project;
- local models can still choose weak actions or return malformed structured output; the pipeline stops and preserves those outcomes instead of presenting fallback output as model success;
- model confidence is a self-assessment, not a calibrated probability that a proposed defect is correct;
- independent replay may be blocked when a journey depends on accumulated or timer-driven state, and a reproduced observation does not prove the inferred expectation;
- the five-public-repository trial confirmed no target defect; it validates pipeline breadth and false-positive control, while historical faulty/fixed pairs remain necessary to measure defect recall;
- initial flow planning covered about 9.8% of observed opportunities in the five-project sample; the improved MDN replan reached 42%, but broader repeated evaluation is still required;
- videos and traces increase guest-run storage; they remain disabled for authenticated runs until a safe redaction audit is available.
