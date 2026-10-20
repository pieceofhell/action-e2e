# Ollama Toy Examples Evaluation Report

**Date:** 26 July 2026  
**Model:** Local Ollama, `llama3.1:8b` (8B parameters, Q4_K_M)  
**Prototype:** Action E2E Prototype  
**Scope:** Current end-to-end pipeline validation on two web applications

> Historical experiment note: this report captures the earlier Ollama-focused guest runs. Authenticated read-only support was implemented and validated later; see `features/auth.md` and `updates.md` for the current architecture and Janvas 2/2 protected-route run.

## Objective

This evaluation checks whether the proposed pipeline can inspect a web project, use a local language model to propose user flows and acceptance criteria, generate Playwright artifacts, execute them, and return visual evidence and actionable insights. It also assesses the failure modes of model-authored test code and the safeguards needed for reliable automation.

## Tested Applications

| Application | Role in the evaluation | Runtime | Final run |
| --- | --- | --- | --- |
| [MDN To-do Notifications](https://github.com/mdn/dom-examples/tree/main/to-do-notifications) | Small, form-oriented reference application with several labeled controls | Prototype static server | `to-do-notifications-2026-07-26T14-13-54-997Z` |
| Janvas / Canvas Wrapper Test | Main toy example: a Canvas wrapper web application with a command-based development server | `bun run dev:web` at `http://127.0.0.1:3000` | `canvas-wrapper-test-2026-07-26T14-16-21-981Z` |

The generated artifacts are intentionally kept outside both target projects, under `prototype-runs/<run-id>/`. The original source trees are not modified.

## Evaluation Method

For each application, the following pipeline was executed with `llama3.1:8b`:

1. Inspect the repository using documentation, manifests, source structure, and UI hints.
2. Start or serve the target application and perform live browser exploration.
3. Ask the model to propose user flows and structured acceptance criteria; retain only non-low-confidence flows.
4. Ask the model to draft Playwright test bodies from the approved criteria and the observed interface.
5. Validate the draft against safety and grounding rules; use deterministic Playwright code if the draft is not supported by live evidence.
6. Execute the generated suite and retain Playwright screenshots, videos, traces, logs, JSON results, and pipeline insights.

The model therefore participates in project interpretation, flow planning, acceptance-criteria authoring, test drafting, and result enrichment. The execution engine retains the final responsibility for selector validity and reproducibility.

## Final Results

| Application | Approved flows | Generated artifacts | Passed | Failed | Model-authored bodies accepted | Evidence collected |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| MDN To-do Notifications | 3 | 3 | 3 | 0 | 1 | Screenshot, video, and trace for each test |
| Janvas / Canvas Wrapper Test | 2 | 2 | 2 | 0 | 0 | Screenshot, video, and trace for each test |
| **Total** | **5** | **5** | **5** | **0** | **1** | **15 evidence files plus logs and JSON reports** |

The MDN run exercised the form flow, including entry of a task title and scheduling values. The screenshot below is the visual evidence generated after that test completed:

![MDN form test evidence](C:/Users/henri/Documents/action-e2e-prototype/prototype-runs/to-do-notifications-2026-07-26T14-13-54-997Z/results/test-artifacts/primary-form-review-Primary-form-review/test-finished-1.png)

The full results are available locally:

- [MDN Playwright report](C:/Users/henri/Documents/action-e2e-prototype/prototype-runs/to-do-notifications-2026-07-26T14-13-54-997Z/results/playwright-results.json)
- [MDN visual-evidence index](C:/Users/henri/Documents/action-e2e-prototype/prototype-runs/to-do-notifications-2026-07-26T14-13-54-997Z/results/visual-evidence.json)
- [MDN pipeline insights](C:/Users/henri/Documents/action-e2e-prototype/prototype-runs/to-do-notifications-2026-07-26T14-13-54-997Z/results/insights.json)
- [Janvas Playwright report](C:/Users/henri/Documents/action-e2e-prototype/prototype-runs/canvas-wrapper-test-2026-07-26T14-16-21-981Z/results/playwright-results.json)
- [Janvas visual-evidence index](C:/Users/henri/Documents/action-e2e-prototype/prototype-runs/canvas-wrapper-test-2026-07-26T14-16-21-981Z/results/visual-evidence.json)
- [Janvas pipeline insights](C:/Users/henri/Documents/action-e2e-prototype/prototype-runs/canvas-wrapper-test-2026-07-26T14-16-21-981Z/results/insights.json)

## Quality Findings and Improvements Applied

Early exploratory runs exposed a genuine limitation: static project reading alone does not reliably provide usable selectors. Without live exploration, the MDN example passed 1 of 3 generated tests. A first Janvas run passed 1 of 2 tests because the model authored generic selectors such as `getByRole('heading')` and `getByRole('button')` without an accessible name.

The following safeguards were implemented and covered by the internal test suite:

| Finding | Improvement | Effect in the final runs |
| --- | --- | --- |
| A model may infer controls that are not present. | Model-authored code is allowed only after successful live browser exploration. | Test generation is grounded in actual rendered routes and controls. |
| Generic role selectors are ambiguous. | Reject unscoped generic roles unless they include an observed accessible name. | The Janvas drafts were safely replaced before execution. |
| A label can be mistaken for a placeholder. | Validate `getByLabel()` and `getByPlaceholder()` values against observed form metadata. | The MDN form fallback used the real label evidence instead of a non-existent placeholder. |
| A draft can omit navigation or return a complete nested test. | Require `await openHome(page)` before interaction and reject nested `test(...)` blocks. | Generated files maintain one controlled test per approved flow. |
| A passing run is hard to audit from text alone. | Retain screenshot, video, and Playwright trace for every test, including passes. | Every final test has visual and replayable evidence. |

The implementation deliberately treats a rejected model draft as an observable outcome. The UI reports the generation mode and the reason for each fallback; it does not silently claim that a deterministic artifact was authored by the model.

## Verification Performed

The repository's automated verification passed after the changes:

```text
3 tests passed, 0 failed
```

The tests cover provider normalization, Playwright evidence/report parsing, and the live-evidence/selector-grounding gate for model-authored code. In addition, the two full pipeline runs above were executed with the actual local `llama3.1:8b` server, not with the internal heuristic fallback.

## Interpretation

The evaluation supports the central pipeline hypothesis at prototype scope: a local LLM can contribute semantic interpretation and test intent, while live interface observation and deterministic guardrails turn that contribution into reproducible E2E artifacts. The value is not unrestricted code generation; it is a human-reviewable workflow that combines model reasoning with observable browser evidence.

The current evidence is promising but not a benchmark. It covers two toy applications and primarily smoke-level user flows. The Janvas interface also exposes few explicit DOM signals, which appropriately limits the diversity and confidence of the generated flows.

## Recommended Next Experiments

1. Compare `llama3.1:8b` with at least one other local or hosted provider using the same approved flows and measure acceptance-criteria quality, fallback rate, execution success, and latency.
2. Extend the implemented authenticated read-only adapters to more applications with navigation, asynchronous content, and error states.
3. Expand the live explorer with DOM snapshots, accessibility-tree information, and interaction observations so that the model can propose deeper, yet still grounded, scenarios.
4. Define evaluation metrics for the research phase: flow coverage, criteria completeness, model-draft acceptance rate, execution pass rate, false-positive rate, runtime, and human-review effort.
