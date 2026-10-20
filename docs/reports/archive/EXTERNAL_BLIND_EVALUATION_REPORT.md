# External Blind UI-Defect Evaluation

> **Historical report:** this document records the first integrated Fake Store evaluation and its then-current reviewer behavior. It is preserved as development history. The current three-application trial, confidence audit, and confirmed historical TodoMVC red/green result are documented in [`BUG_DISCOVERY_TRIAL_REPORT.md`](BUG_DISCOVERY_TRIAL_REPORT.md).

Date: August 23, 2026  
Prototype: Action E2E Prototype (E2P)  
Model: `qwen2.5vl:7b` through local Ollama

## 1. Research Question

Can the Dopa experiment be converted into a reusable E2P capability that receives an unfamiliar local web project, understands and starts it, explores the interface through model-selected actions, records reviewable defect hypotheses, generates Playwright tests, executes them, and distinguishes observed facts from model inference without project-specific rules?

The success criteria for this evaluation were:

1. the target must not be authored by the E2P contributors;
2. the model must not receive issues, known bug descriptions, fix diffs, or named problem areas;
3. startup, exploration, defect review, flow planning, generation, execution, and interpretation must use the same generalized E2P services;
4. every retained defect candidate must cite reproduced UI evidence;
5. normal behavior must not be promoted merely to make the experiment appear successful;
6. previous guest behavior and automated regressions must continue to pass.

## 2. Important Dopa Clarification

The prior Dopa result was blind with respect to the withheld defect: the successful vision-only run did not receive the issue, fix, source diff, fixed screenshot, or ground-truth description. However, that experiment was narrower than the integrated workflow. The model received a named navigation-consistency campaign and screenshots from a state that the harness had already reached.

Therefore, the accurate claim is:

> A local vision model detected the withheld Dopa Favorites inconsistency from UI evidence under a named QA campaign, and its grounded trajectory could be compiled into an executable oracle. The earlier experiment did not yet prove autonomous project startup and open-ended journey selection on an unknown application.

The external evaluation below closes that implementation gap.

## 3. Selected External Project

Repository: [`devamir99/fakestore-app`](https://github.com/devamir99/fakestore-app)  
Evaluated commit: `8e205db216ad16b370761e65274fad151b73f85e`  
Local checkout: `C:\Users\henri\Documents\e2p-targets\fakestore-app`

### Why it is a useful target

- It is a public third-party repository.
- It starts locally with Vite and does not require a production account or backend fixture.
- It has a richer UI than a single-form or counter example.
- It exposes search, category filters, product details, favorites, cart, quantity, navigation, theme, empty states, feedback toasts, and multiple routes.
- State changes are visible and can be evaluated through screenshots and Playwright.
- The project remains small enough for repeatable local runs.

The target was selected from its README, manifest, and visible capabilities. No issue list or known defect history was consulted before the experiment.

## 4. Implemented Capability

### 4.1 Stateful evidence

`agentic-explorer.js` now records a graph rather than a list of disconnected actions. Every completed step stores:

- action kind and accessible name;
- nearest card/product context when available;
- model rationale and expected outcome;
- `beforeStateId` and `afterStateId`;
- whether the structured UI state changed;
- summarized post-action UI evidence.

Every distinct guest state receives up to four viewport screenshots. The user can inspect all tiles, while the local vision model receives one focal image per decision to keep requests bounded.

### 4.2 Bug-hunter role

`bug-discovery.js` reviews each focal state with immediate structured before/after context. It may propose a candidate only when it supplies:

- title and objective description;
- affected flow and preconditions;
- grounded reproduction steps;
- observed result and cited facts;
- inferred expected result;
- expectation source and justification;
- severity and confidence;
- valid evidence state IDs.

A candidate is removed when it lacks a factual anomaly, cites an unknown state, describes only a visible control, or lacks a reproducible path.

### 4.3 Conservative reviewer role

A separate model call attempts to falsify each candidate. It rejects candidates when:

- the observed UI already satisfies the expected result;
- the state is an ordinary empty or minimum/maximum condition;
- the alleged action was not executed;
- visible feedback contradicts the claim;
- evidence only confirms the presence of a control.

Rejected titles and reasons remain in the report. A critic can also make mistakes; its verdict is evidence for a human reviewer, not ground truth.

### 4.4 UI and artifacts

The E2P page now includes `Potential defects` immediately after project inspection. Retained items separate `Observed facts` from `Expected behavior — inference` and show reproduction, severity, confidence, screenshots, browser errors, and critic reasoning. Rejected candidates appear in a collapsible list.

The exploration workspace is created before the target starts and is reused through generated tests. A full run can contain:

```text
prototype-runs/<run-id>/
  exploration.json
  inspection.json
  approved-flows.json
  generated-tests.json
  artifacts/exploration/*.jpg
  tests/*.spec.cjs
  results/potential-bugs.json
  results/playwright-results.json
  results/visual-evidence.json
  results/blind-evaluation.json
```

## 5. Engineering Findings During Evaluation

The first attempts are retained because they exposed general E2P limitations rather than target-specific exceptions.

| Attempt | Stopping point | General finding | Implemented correction |
| --- | --- | --- | --- |
| 1 | First visual decision | Four images exceeded the model context. | One model image per decision; all tiles remain on disk. |
| 2 | Action 16 | An off-screen skip link was classified as visible. | Visibility excludes controls displaced above or left of the usable page. |
| 3 | Defect review | Seven of eight two-image batches exceeded context and normal behavior became a hypothesis. | One focal state per call, explicit anomaly grounding, partial-status reporting. |
| 4 | Flow planning | Long structured JSON was truncated. | Ollama context increased to 16,384 and JSON output allowance increased. |
| 5 | Complete | Five initial candidates survived the author role. | Conservative reviewer rejected all five; no false defect was retained. |
| 6 | Final-code run | Two transition reviews repeated enough page data to exceed model context. | Journey prompts now retain compact action and state references instead of duplicating complete control catalogs. |
| 7 | Generated execution | `Cart` matched links in both header and footer. | Repeated accessible-control occurrences are now explicit in compiled Playwright locators. The same saved journey then passed. |

The model also selected a generic `Add to favorites` icon on a related-product card. Without context, it appeared that a jacket was saved but a backpack later appeared in Favorites. Screenshot review showed that the clicked heart belonged to the related backpack. E2P now enriches generic icon actions with the nearest heading so future reports identify the actual product.

## 6. Final Complete Run

Run ID: `fakestore-app-2026-08-23T23-24-04-964Z`

### Exploration results

| Metric | Result |
| --- | ---: |
| Model-selected actions | 20 |
| Distinct structured states | 11 |
| Persisted viewport screenshots | 44 |
| Focal defect reviews | 11/11 |
| Defect-review call errors | 0 |
| Browser console errors | 0 |
| Browser page errors | 0 |

The model exercised Cart and Favorites empty states, collection browsing, Enter and text entry in search, clearing search, theme switching, product details, quantity decrease, Shop, About, and category navigation.

### Defect results

| Stage | Count |
| --- | ---: |
| Initial grounded candidates | 8 |
| Rejected by conservative review | 8 |
| Retained potential defects | 0 |
| Human-confirmed defects | 0 |

No potential defect is reported for this run. This is a result, not a missing output.

### Rejected false positives

| Candidate | Why it was rejected |
| --- | --- |
| `Navigation to 'Favorites' page` | The empty Favorites message matched the expected state. |
| Search/filter candidates (3) | The cited states did not establish the claimed mismatch or the field value assumed by the hypothesis. |
| `Quantity Input Not Visible` | The quantity input was visible in the cited product-detail state. |
| `Add to Cart Button Missing` | The control was visibly present. |
| `Quantity Increment Button Not Working` | The explored action was a decrease, not the claimed increase; the candidate lacked an executed reproduction. |
| `Missing Related Products Section` | The section existed; an empty result alone did not establish a requirement violation. |

### Flow, test, and execution results

| Metric | Result |
| --- | ---: |
| Admissible model-authored flows | 1 |
| Generated Playwright tests | 1 |
| Passing tests | 1 |
| Failing tests | 0 |
| Test duration | 8.3 s |

The accepted flow was `User navigates to Cart page in fakestore-app`. The free-form model test draft did not pass E2P's structural checks, so E2P compiled the model's already executed and recorded journey into constrained Playwright. The first execution correctly surfaced an ambiguous `Cart` locator because that name existed in two landmarks. After the general locator correction, E2P regenerated the test from the same saved journey and it passed. This is not a prewritten smoke fallback: the action sequence came from the current model run and remained tied to observed controls.

## 7. Concrete Evidence

- Full evaluation: `prototype-runs/fakestore-app-2026-08-23T23-24-04-964Z/results/blind-evaluation.json`
- Defect report: `prototype-runs/fakestore-app-2026-08-23T23-24-04-964Z/results/potential-bugs.json`
- Exploration graph: `prototype-runs/fakestore-app-2026-08-23T23-24-04-964Z/exploration.json`
- Generated test: `prototype-runs/fakestore-app-2026-08-23T23-24-04-964Z/tests/semantic-id.spec.cjs`
- Playwright result: `prototype-runs/fakestore-app-2026-08-23T23-24-04-964Z/results/playwright-results.json`
- UI rendering check: `output/playwright/e2p-potential-defects-panel.png`
- Automated suite: 53 passed, 0 failed.

## 8. Reproduction

### UI path

1. Start Ollama and confirm `qwen2.5vl:7b` is available.
2. Run `npm.cmd start` in the E2P directory.
3. Open `http://127.0.0.1:4318`.
4. Select `Local Ollama` and `qwen2.5vl:7b`.
5. Select a local web-project directory and load it.
6. Keep access mode `Guest`.
7. Confirm or adjust the inferred start command and base URL.
8. Click `Explore live interface` and follow `Live activity`.
9. Review `Potential defects`, including rejected candidates.
10. Continue through flows, human approval, generation, execution, and results.

### Repeatable evaluator

```powershell
npm.cmd run evaluate:blind-local -- "C:\path\to\web-project" "qwen2.5vl:7b"
```

The evaluator accepts any local project path. The script contains no Fake Store routes, labels, selectors, flows, or defect rules.

## 9. What This Evaluation Demonstrates

- The Dopa experiment has been converted into an ordinary E2P feature rather than remaining an isolated harness.
- An unfamiliar third-party project can complete the full pipeline without project-specific code.
- The model can autonomously select a broad set of UI actions and reach stateful commerce flows.
- Evidence, hypotheses, rejected candidates, generated tests, and execution results can share one traceable run.
- A second review stage materially reduced false-positive reporting in this run.
- The correct outcome can be zero retained defects.

## 10. Limitations and Next Evaluation Work

- One external project and one final model run do not estimate recall or precision.
- The exploration ceiling limited the reachable state space; checkout and other finalizing actions were outside the experiment.
- The model spent decisions on low-value actions such as pressing Enter before filling search.
- One accepted flow and one passing test are insufficient for broad coverage claims.
- A same-model critic can share blind spots with the author role.
- Screenshot reasoning and structured-output quality depend on the model and local context limit.
- The absence of a retained hypothesis does not establish that the target has no defects.
- Human review remains necessary for every candidate.

The next controlled study should repeat this protocol across multiple external targets, models, and seeds, then report explored-state diversity, candidate rate, critic rejection rate, human precision, confirmed-defect rate, valid-test rate, runtime, and reviewer effort.
