# Action E2E Prototype: Cross-Machine Handoff

Updated: September 1, 2026

## 1. One-Paragraph Context

Action E2E Prototype (E2P) is the implementation and experimental instrument for an undergraduate research project about action-oriented language models in web E2E quality assurance. An action-oriented model is an LLM that does not merely generate text: it selects operations from an explicit, bounded catalog over the observed application. E2P inspects a local web project, starts it, lets the selected model explore its live interface, records evidence, asks the model to propose user flows and acceptance criteria, requires human approval, compiles Playwright from the model-executed journey, runs the tests, and consolidates objective artifacts and model interpretation. The current research question is not simply whether generated tests execute, but whether models can explore meaningfully, produce useful QA coverage, and identify reproducible UI defects without unsupported claims.

## 2. Repositories and Artifacts

| Item | Location or source | Current role |
| --- | --- | --- |
| E2P source | `https://github.com/pieceofhell/action-e2e.git` | Authoritative implementation repository. |
| Local E2P checkout used in this session | `C:\Users\henri\Documents\action-e2e-prototype` | Code, documentation, committed evaluation summaries, and ignored local run artifacts. |
| Janvas fork | `https://github.com/pieceofhell/canvas-wrapper-test.git` | Original toy target and current location of the academic LaTeX tree. |
| Current article source observed during handoff | `C:\Users\henri\Documents\GitHub\canvas-wrapper-test\latex\main.tex` | Last modified August 19, 2026; it predates the latest five-repository benchmark. |
| Current compiled article observed during handoff | `C:\Users\henri\Documents\GitHub\canvas-wrapper-test\latex\main.pdf` | Compiled immediately after the source above; newer than `main_revisado.pdf`. |
| Presentation | User previously identified it as `action-e2e-pitch-deckv2` | Its file was not found during this audit. Locate or reattach it before making further presentation edits. |

The Janvas checkout was dirty during this handoff: root `main.tex` was deleted, `package-lock.json` was modified, and `.codex/run-logs/` plus `latex/` were untracked. Do not clean, reset, or commit that separate repository without reviewing those user changes.

## 3. Academic Continuity

### TCC I boundary

TCC I covered the theoretical foundation, literature review, proposed methodology, initial flowchart, article versions, and early demonstrable prototype. The practical boundary agreed in the conversation is the creation/publication of the E2P GitHub repository. Work after that point belongs to TCC II.

### TCC II work completed so far

- Reoriented the ordinary pipeline to AI-first behavior: required model stages stop explicitly instead of silently using heuristic semantic output.
- Added structured, stateful live interface exploration with model-selected actions and visible real-time activity.
- Added support for local Ollama, LM Studio, hosted providers, custom OpenAI-compatible endpoints, selectable models, and a contextual model console.
- Added local VLM screenshot transport for visual review while retaining structured browser evidence.
- Added human review and approval of model-authored flows and acceptance criteria.
- Added Playwright generation from the exact model-executed journey, visual evidence, traces, videos, and failure classification.
- Added guest and authenticated read-only modes with environment-backed secret references and constrained actions.
- Added potential-defect hypotheses that separate observed facts from inferred expectations, conservative screening, independent review, and clean-session replay.
- Added adaptive action budgets and coverage opportunities instead of requiring a hardcoded number of decisions; 20 actions and 180 seconds remain ceilings, not targets.
- Executed local candidate trials, a 20-application exploratory bench, historical faulty/fixed controls, three current public trials, and a later five-public-repository benchmark.

### Required article terminology

- Use impersonal academic language and refer to the work as `este projeto`, never `este TCC` or similar self-referential wording.
- Define an action-oriented language model early: an LLM that selects operations from an explicit and restricted action space over the observed system.
- Use `model-guided live interface exploration` when the model receives structured DOM/browser observations.
- Use `multimodal` or `vision-assisted exploration/review` only when `visionEnabled` is true and the selected VLM actually receives screenshot evidence.
- A screenshot shown to the human does not by itself justify saying that a text-only model visually inspected the application.
- Odysseus should remain related work, not a central planned implementation dependency unless a future experiment supplies new evidence.

### Article update still needed

The August 19 article abstract reports only earlier `qwen3:8b` Janvas and TodoMVC results. It does not yet incorporate the historical TodoMVC red/green proof, stricter evidence contract, independent replay, 20-app findings, five-public-repository benchmark, 74-test regression suite, or expanded MDN coverage result. The next article revision should update methodology, implementation description, experimental table, limitations, and the pipeline figure without overstating unknown-bug discovery.

## 4. Current Pipeline

1. The user selects a local project directory.
2. E2P reads documentation, manifests, structure, routes, components, and UI hints.
3. The selected model interprets grounded project evidence.
4. The user confirms guest or authenticated read-only access.
5. E2P starts the target or serves a static target, opens Chromium, and exposes currently visible actions.
6. The selected model chooses an action ID; E2P derives the canonical click, fill, select, or press operation.
7. E2P records states, transitions, screenshots, visible controls, diagnostics, and model rationale in the live viewer.
8. Potential-defect candidates are screened against evidence, independently reviewed, and replayed when possible.
9. The model authors flows and Given/When/Then acceptance criteria tied to executed actions and states.
10. The user approves flows.
11. E2P validates observed locators and compiles Playwright from the model journey.
12. E2P starts the target, executes tests, records evidence, classifies failures, and asks the model to interpret objective results.

The normal pipeline does not use arbitrary semantic heuristics. A hidden experimental control exists only when E2P starts with `E2P_ENABLE_BASELINE_MODE=1`.

## 5. Current Architecture

| Area | Main implementation |
| --- | --- |
| Local UI and API | Express server in `src/server.js`; browser UI in `public/`. |
| Project understanding | `project-inspector.js`, followed by model interpretation in `ai-workflows.js`. |
| Runtime | `runtime-orchestrator.js`; static and command targets, working-directory inference, loopback probing, cleanup, and inferred package-manager availability checks. |
| Model layer | `llm-provider.js`; Ollama, LM Studio, hosted presets, and custom OpenAI-compatible endpoints. |
| Exploration | `live-explorer.js` and `agentic-explorer.js`; grounded action catalog, adaptive budgets, state capture, dynamic-control refresh, and visible progress. |
| Findings | `bug-discovery.js` plus `hypothesis-reproducer.js`; evidence contract, reviewer, observed/inferred split, and replay status. |
| Planning | `ai-workflows.js`; up to six model-authored flows, per-transition decomposition, confidence calibration, and observed-opportunity coverage. |
| Generation | `test-generator.js`; only model-executed guest journeys are compiled in ordinary AI-first mode, with locator validation. |
| Execution | `test-runner.js`; target startup, Playwright, evidence indexing, and failure classification. |
| Authenticated mode | `auth-config.js`, `auth-session.js`, `read-only-policy.js`, and `authenticated-executor.js`. |
| Documentation | `README.md`, `specs.md`, `specs.bdd.md`, `candidates.md`, `features/`, `updates.md`, and evaluation reports. |

JavaScript/Node.js was selected for implementation because the project is browser-centered, Playwright's Node ecosystem is direct and mature, Express supports a lightweight local API, JSON artifacts map naturally to model contracts, and one language can cover UI orchestration, project inspection, runtime supervision, generation, and tests. This favors prototype speed, inspectability, and future extension over a heavier multi-language architecture.

## 6. Models and Reproducible Configuration

The latest public benchmark used local Ollama with:

| Role | Model | Local size observed |
| --- | --- | ---: |
| Author, explorer, and screenshot-capable reviewer | `qwen2.5vl:7b` | 6.0 GB |
| Independent conservative reviewer | `gemma3:12b` | 8.1 GB |

Earlier installed/evaluated profiles include `qwen3:8b`, `llama3.1:8b`, and `qwen2.5-coder:7b`. OpenLLaMA 8B motivated the original local-model selection work but is not the strongest current reproduction profile. Model names, target revision, action/state counts, stop reason, and run number must be reported because repeated local-model runs are not deterministic in practice.

The complete fresh-machine setup and exact commands are in `README.md`.

## 7. Evidence Established So Far

### Historical Dopa POC

A historical Dopa Favorites defect was reproduced across faulty/fixed revisions, and a VLM could propose the relevant navigation inconsistency without receiving the issue or diff. However, Dopa was co-developed by the user with assistance in this broader project, so it is not an independent external validation target.

### Historical TodoMVC control

The strongest public defect proof is a TodoMVC React historical revision. E2P/model exploration entered a one-character task and pressed Enter. The historical revision failed to create the item; the same generated Playwright journey passed on the current control revision. Human adjudication confirmed one of two retained hypotheses. This is an issue-withheld historical benchmark, not fully unbiased project selection. See `BUG_DISCOVERY_TRIAL_REPORT.md`.

### Five unknown public repositories

Anon eCommerce, Build a Quiz App, Cypress Kitchen Sink, MDN Todo React, and The React Quiz completed the trial with one model pair and no known-bug input. Aggregate evidence:

- 67 completed model actions.
- 59 recorded interface states.
- 25 initially retained potential-defect hypotheses.
- 0 hypotheses retained by the current stricter evidence contract.
- 12 underlying observations reproduced in clean sessions.
- 13 replays blocked by transient or accumulated state.
- 3/5 original generated scenarios passed before compiler corrections.
- 5/5 original scenarios passed after focused corrections and replay.
- Expanded MDN plan: five flows, 42% of 12 observed opportunities, 5/5 tests passed.
- 0 target-application defects confirmed in this five-project sample.

This trial demonstrates reusable pipeline breadth, evidence handling, and reduced false positives. It does not demonstrate useful unknown-defect recall. See `PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md` and `evaluation-results/post-improvement-mdn-validation.json`.

### E2P self-validation

The complete automated suite currently passes 74/74 tests. It covers guest and authenticated execution, model/provider contracts, AI-first stop behavior, multimodal formatting, dynamic-control recovery, flow grounding, coverage, locator compilation, finding screening, replay, result parsing, progress UI, and runtime inference.

## 8. Important Corrections Already Made

- Native Windows folder selection replaced mandatory manual path entry; manual entry remains available.
- The page was widened and centered, the pipeline explanation moved into a modal, and live activity became sticky and visible.
- Firefox slowness was reduced by avoiding expensive compositing over long surfaces.
- Runtime startup now detects announced loopback URLs and handles localhost, IPv4, and IPv6 variants.
- Failed starts clean up the target process tree instead of leaving the port occupied.
- An inferred Yarn/pnpm lockfile is used only if that command exists; npm is the fallback unless the manifest explicitly requires another manager.
- The model selects an action ID, while E2P derives its operation kind; this removed repeated fill-versus-press mismatches.
- Dynamic overlays, timers, and hidden controls refresh the action catalog rather than executing a stale action.
- Flow IDs derive from the actual action and resulting state, preventing placeholder-ID collapse.
- Distinct actions may produce distinct flows even when they return to the same state.
- Accessible locators preserve complete names, semantic peer occurrence, real select values, and case-only tolerance for CSS text transforms.
- Overlay-closing tests assert that the overlay closed rather than asserting unstable promotional text.
- Automation-locator failures are not reported as target behavior failures.
- Interface-convention and contradicted defect hypotheses are rejected before presentation.

## 9. Known Weaknesses and Open Problems

- Unknown-defect recall is not established. The latest five-project sample confirmed no target defects.
- Initial flow coverage in that sample was about 9.8%. The MDN replan reached 42%, but the improved planner has not yet been rerun three times over every public target.
- Model confidence is not calibrated probability. Medium and high confidence have both appeared on false positives.
- Clean-session replay cannot always reconstruct accumulated, randomized, or timer-driven state.
- A reproduced observation validates reachability, not the model's inferred expected behavior.
- The evidence contract is conservative and may reject real but undocumented usability defects.
- One author/reviewer pair is insufficient for model-independent conclusions.
- Timed and rapidly changing controls can expire between observation and action even with catalog refresh.
- Applications requiring multiple local processes need manual preparation; The React Quiz requires its JSON server separately.
- The Windows folder dialog is platform-specific.
- Videos, traces, screenshots, and local models consume substantial disk space.
- The article and older status documents may contain historical descriptions of heuristic fallback. Current authoritative behavior is AI-first as documented in `README.md`, `specs.md`, `specs.bdd.md`, and `updates.md`.
- The presentation file was not available during this handoff, so its final bibliography slide and latest edits cannot be independently verified here.

## 10. Recommended Next Steps

1. Freeze a public corpus of independently verifiable historical UI bug/fix pairs and hide the defect descriptions from the exploration model until adjudication.
2. Rerun every current public target at least three times with the improved planner, recording variance in actions, states, coverage, hypotheses, duration, and stop reason.
3. Measure precision, recall, confirmed-defect rate, replay rate, flaky rate, semantic opportunity coverage, and human-review disagreement separately.
4. Add replay checkpoints that can reconstruct multi-step, local-storage, randomized, and timer-driven preconditions.
5. Add a model-authored edge-case mission phase after broad exploration, while grounding every mission in observed application capabilities.
6. Compare at least three model configurations under identical revisions and budgets. Keep the VLM and text-only conditions separate.
7. Evaluate agent-role separation only as an experiment: explorer, flow author, oracle author, test compiler, and critic. Do not assume more agents improve correctness without measured evidence.
8. Add first-class support for targets requiring multiple startup commands.
9. Update the LaTeX article, abstract, methodology, implementation section, results table, limitations, and flowchart with the post-August-19 evidence.
10. Locate the final presentation and update it only after reconciling its claims with the current reports.

## 11. Starting on Another Machine

1. Clone `https://github.com/pieceofhell/action-e2e.git`.
2. Read `README.md` and follow `Reproduce E2P From a Fresh Machine` exactly.
3. Pull `qwen2.5vl:7b` and `gemma3:12b` in Ollama for the comparable condition.
4. Run `npm.cmd test` and require 74/74 before evaluating targets.
5. Clone targets at the revisions listed in `README.md`.
6. Begin with MDN Todo React because it currently supplies the deepest validated flow result.
7. Preserve every `prototype-runs/<run-id>` directory needed for analysis before changing branches or machines; these directories are intentionally ignored by Git.
8. Do not transfer environment secrets through Git. Recreate only environment-variable references required for a separate authenticated experiment.
9. Read `PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md` before claiming target defects or benchmark success.
10. Treat this handoff, `README.md`, `specs.md`, and `updates.md` as the current project state; older reports are historical snapshots.
