# E2P Public Repositories Benchmark Report

Evaluation period: August 26-28, 2026

## 1. Purpose

This benchmark evaluates the improvement plan derived from the previous 20-application trial against five additional public web repositories. None of the targets was authored by the E2P contributors. The same local model pair, execution boundaries, and guest workflow were used throughout the sample.

The experiment was intentionally blind with respect to target defects: repository issues, known failure descriptions, and fix histories were not supplied to the models. E2P inspected each project, started it locally, explored its rendered interface, proposed flows, generated Playwright tests, executed them, and reviewed potential UI defects from the evidence it collected.

## 2. Protocol

- Exploration and flow author: local Ollama `qwen2.5vl:7b`.
- Independent hypothesis reviewer: local Ollama `gemma3:12b`.
- Access: guest sessions only.
- Inputs: project documentation, manifests, source structure, structured interface states, and locally captured viewport evidence.
- Actions: bounded clicks, text entry, selection, Enter, navigation, and visual observation.
- Target changes: none.
- Result policy: a replayed observation is not automatically a confirmed defect; an inferred expectation must also be supported by evidence.

## 3. Public Targets

| Target | Evaluated revision | Why it was selected |
| --- | --- | --- |
| [Anon eCommerce](https://github.com/codewithsadee/anon-ecommerce-website) | `28181229be9973f9c5dc77ce1e07af08b8ab3d91` | Static storefront with delayed overlays, menus, search, categories, and repeated commerce controls. |
| [Build a Quiz App](https://github.com/jamesqquick/Build-A-Quiz-App-With-HTML-CSS-and-JavaScript) | `ef07bc7c4baa51bad8eb44727895a5dd667e41dc` | Multi-screen vanilla JavaScript quiz with progress, scoring, and high-score states. |
| [Cypress Kitchen Sink](https://github.com/cypress-io/cypress-example-kitchensink) | `ae5284ece83008b5f9ac1982201d38a82c3a1420` | Dense interaction catalog with repeated links, forms, controls, and navigation surfaces. |
| [MDN Todo React](https://github.com/mdn/todo-react) | `f7a0866a347655ba10fd2f43f5c9c0c62ca54f73` | Semantically rich task manager with creation, filters, completion, editing, and deletion states. |
| [The React Quiz](https://github.com/TheNarh/The-React-Quiz) | `a7c9ef43e703d23fe7605a224bf28431d78c9fba` | Timed React quiz whose controls and state can change while exploration is in progress. |

## 4. Aggregate Results

| Measurement | Result |
| --- | ---: |
| Public applications completing the full pipeline | 5/5 |
| Model-executed interface actions | 67 |
| Distinct recorded interface states | 59 |
| Potential-defect hypotheses initially retained by the model stage | 25 |
| Hypotheses retained by the current evidence contract | 0 |
| Observations independently reproduced | 12 |
| Replays blocked by a different starting or transient state | 13 |
| Original one-flow tests passing before compiler corrections | 3/5 |
| Original scenarios passing after correction and focused replay | 5/5 |
| Expanded MDN flow suite | 5/5 passed |
| Expanded MDN semantic opportunity coverage | 5/12, or 42% |
| Confirmed target-application defects in this sample | 0 |

The absence of a confirmed target defect is a valid result. The earlier pipeline was willing to retain plausible but weak expectations. Under the current contract, all 25 were rejected because the expected behavior was undocumented, contradicted by the cited state, unrelated to a completed action, or based only on a generic interface convention. Reporting these as findings would have overstated E2P's value.

## 5. Per-Application Results

### 5.1 Anon eCommerce

- Full run: `anon-ecommerce-website-2026-08-26T23-43-04-206Z`.
- Exploration: 20 completed actions and 13 states.
- Initial hypotheses: 11; current evidence-screen result: 0 retained and 11 rejected.
- Replay: four observations reproduced and seven blocked by a different transient state.
- Generated scenario: 1/1 passed after the compiler was taught to assert that a closed overlay stayed closed instead of selecting a rotating promotional heading.

This target exposed two E2P defects rather than a target defect. A delayed promotional overlay could intercept an action selected from an earlier state, and a submenu could disappear before execution. E2P now refreshes the action catalog and asks the model for a new decision when an observed control becomes unavailable.

### 5.2 Build a Quiz App

- Full run: `quiz-app-master-2026-08-26T23-54-10-920Z`.
- Exploration: 12 completed actions and 11 states.
- Initial hypotheses: five retained and one rejected; current evidence-screen result: all five rejected.
- Replay: five blocked because the clean session did not reach the same accumulated quiz state.
- Generated scenario: 1/1 passed.

The repository root contains multiple tutorial stages, so E2P correctly refused to invent a single root runtime. The actual application subdirectory was then selected in the same way a user would select it in the UI. Claims involving high-score defaults, focus behavior, and progress were not supported strongly enough to be reported as defects.

### 5.3 Cypress Kitchen Sink

- Full run: `cypress-kitchensink-2026-08-26T23-59-38-475Z`.
- Exploration: 12 completed actions and nine states.
- Initial hypotheses: four retained and one rejected; current evidence-screen result: all four rejected.
- Replay: all four cited observations reproduced.
- Generated scenario: 1/1 passed after recompilation.

The first test used a fragile global link position and timed out. E2P now prefers the captured accessible name and occurrence among semantic peers. The replay confirmed that the cited interface states could be reached, but it did not validate the model's unsupported expectations about checkbox and form behavior.

### 5.4 MDN Todo React

- Full run: `mdn-todo-react-2026-08-27T00-08-12-541Z`.
- Exploration: 19 completed actions and 17 states.
- Initial hypotheses: four; current evidence-screen result: all four rejected.
- Replay: all four cited observations reproduced.
- Initial generated scenario: 1/1 passed.
- Expanded validation: five distinct model-authored flows, 42% of 12 observed semantic opportunities, and 5/5 tests passed.

This target produced the strongest coverage result. Flow planning originally collapsed distinct actions that happened to end in the same state and returned one flow at 8% coverage. E2P now preserves action-to-state identity and generated five distinct flows at 42%. The first expanded execution passed 2/5 because CSS capitalization differed from the browser's accessible names. Exact, case-insensitive semantic locators corrected the compiler without changing the selected journeys; the same five flows then passed 5/5.

The initial runtime also inferred Yarn from a lockfile although Yarn was unavailable. Runtime inference now checks whether an inferred package manager can run and falls back to npm unless the project explicitly requires another manager.

Machine-readable comparison: `evaluation-results/post-improvement-mdn-validation.json`.

### 5.5 The React Quiz

- Full run: `react-quiz-2026-08-27T00-23-09-984Z`.
- Exploration: four completed actions and nine states.
- Initial hypotheses: one retained and two rejected; current evidence-screen result: the retained hypothesis was also rejected.
- Replay: one blocked because the timed state had already changed.
- Generated scenario: 1/1 passed.

The timer repeatedly invalidated controls between observation and action. The refreshed-catalog behavior prevented the pipeline from treating this as an immediate failure. A malformed planning response was recovered through one bounded request for corrected structured output. No heuristic flow replaced the model response.

## 6. Improvements Integrated Into E2P

### Grounded exploration

- Raw accessible names, semantic occurrence indexes, tag positions, and actual select-option values are recorded with each action.
- Controls invalidated by overlays, timers, or dynamic rendering trigger a fresh model decision against the new state.
- Inferred package-manager commands are checked before target startup.

### Flow depth and coverage

- Distinct executed actions are no longer merged merely because their resulting interface fingerprint is equal.
- The planner receives adaptive coverage opportunities derived from executed actions.
- Coverage is shown as covered and uncovered observed opportunities.
- Flow confidence is calibrated against state change, assumptions, and criterion depth rather than accepted directly from the model.

### Test reliability

- Generated Playwright tests compile from the model's executed journey rather than unrelated free-form code.
- Every interaction must satisfy an observed-locator contract before a file is saved.
- Semantic names are exact but case-insensitive, protecting against visual CSS capitalization differences.
- Overlay-closing journeys assert the resulting absence of the overlay rather than unstable promotional text.
- Execution failures are separated into generated-locator, generation, target-runtime, behavior-assertion, timeout, and unclassified categories.

### Finding quality

- Model hypotheses pass a deterministic evidence contract before independent review.
- Expectations based only on convention or preference are rejected.
- Claims must cite real observed states and completed actions; contradicted claims are rejected.
- Surviving observations are replayed in a clean browser session and labeled reproduced, diverged, or blocked.
- Reproduction confirms only the observation. It does not prove that the model's inferred expected behavior is a product requirement.

## 7. Positive Findings

- All five unknown public targets completed E2P's end-to-end pipeline.
- Dynamic overlays, timers, repeated controls, nested tutorial layouts, static applications, and command-based React applications exercised materially different paths.
- The model explored substantially beyond page rendering: task creation and filters, quiz progression, storefront navigation, forms, menus, and timed controls appeared in the recorded journeys.
- Focused corrections converted the two initial automation failures into passing tests without changing the target applications.
- The stricter evidence contract prevented 25 weak or contradicted hypotheses from being presented as target defects.
- The expanded MDN result demonstrates that the same exploration can support more than one shallow flow when action identity is preserved.

## 8. Negative Findings and Limitations

- No target defect was confirmed in this five-project sample. This benchmark validates execution breadth and precision controls, not defect-recall capability.
- Initial planning covered only about five of 51 observed semantic opportunities across the five full runs, roughly 9.8%. The MDN replan improved one target to 42%, but the remaining applications should be rerun under the improved planner.
- Thirteen clean-session replays were blocked by transient or accumulated state, showing that replay needs richer checkpoints and setup reconstruction.
- All 25 initially retained hypotheses had medium author confidence even though none survived current screening. Raw model confidence is therefore not a reliable correctness measure.
- The conservative evidence contract can reduce false positives at the cost of rejecting a real but undocumented usability problem.
- Only one author/reviewer model pair was used, so the results do not establish model-independent performance.
- Timed interfaces remain difficult because their state may legitimately change between model observation and action.

## 9. Interpretation

The benchmark supports a narrower and more defensible conclusion than “E2P found bugs in five public applications.” E2P can now execute a reusable AI-first QA pipeline over varied unknown applications, produce replayable browser evidence, generate technically valid tests from model-executed journeys, measure semantic coverage, and avoid promoting unsupported model guesses to findings.

The strongest demonstrated value in this trial is diagnosis and self-correction of the QA pipeline itself: six generalizable E2P problems were exposed and corrected across dynamic-state recovery, runtime inference, flow identity, locator construction, terminal assertions, and finding screening. Demonstrating autonomous target-defect recall still requires a separate blind corpus containing independently verifiable failures.

## 10. Recommended Next Evaluation

1. Build a frozen benchmark of public historical revisions with independently verifiable UI defects, keeping defect descriptions hidden until after E2P produces its report.
2. Rerun each target at least three times to measure exploration stability, coverage variance, hypothesis precision, and execution reliability.
3. Add model-authored edge-case missions after broad exploration while requiring each mission to remain tied to observed capabilities.
4. Store replay checkpoints for multi-step and timed journeys so clean-session reproduction can reconstruct necessary state.
5. Compare at least three local model profiles under the same targets, budgets, and evidence contract.
6. Report precision and recall separately: current public-app runs primarily test precision, while historical or seeded controls are needed to measure recall.

## 11. Reproduction Evidence

The complete local run artifacts are under:

```text
prototype-runs/anon-ecommerce-website-2026-08-26T23-43-04-206Z
prototype-runs/quiz-app-master-2026-08-26T23-54-10-920Z
prototype-runs/cypress-kitchensink-2026-08-26T23-59-38-475Z
prototype-runs/mdn-todo-react-2026-08-27T00-08-12-541Z
prototype-runs/react-quiz-2026-08-27T00-23-09-984Z
prototype-runs/mdn-todo-react-2026-08-27T00-43-32-822Z
evaluation-results/post-improvement-mdn-validation.json
```

Each completed run preserves inspection, exploration states, model decisions, hypothesis records, generated tests, execution reports, screenshots, videos, traces, and consolidated insights when produced.
