# Action E2E Prototype - Status Report

Date: 2026-07-26

## Executive Summary

The prototype is a local, functional implementation of the proposed pipeline for AI-assisted E2E test generation. It accepts a local web project, inspects available evidence, proposes user flows and acceptance criteria, requires human approval, produces isolated Playwright artifacts, executes them, and presents the results with visual evidence.

The current repository is on commit `389d88e` (`Add visual evidence and multi-provider support`). The working tree was clean before this report was added.

## What Is Implemented

| Planned pipeline stage | Implemented mechanism | Observable outcome |
| --- | --- | --- |
| 1. Project selection | Local directory input and Windows folder-picker endpoint | The target path is explicit before analysis begins. |
| 2. Project inspection | README, manifests, directory structure, relevant source excerpts, UI hints, and nested package-manifest detection | Detects framework, language, probable runtime, warnings, and confidence. |
| 3. User-flow proposal | Heuristic planner plus optional model refinement | Candidate flows are grounded in detected routes, forms, actions, canvas elements, and live exploration when available. |
| 4. Acceptance criteria | Structured Given/When/Then criteria shown as editable text | The reviewer can change and approve each flow before any test is produced. |
| 5. Test generation | Playwright specs generated in an isolated run directory | The selected model can author a test body; syntax and safety checks enforce a deterministic fallback when needed. |
| 6. Test execution | Runtime orchestration for `static`, `command`, and `external` targets | The target is started or served locally and tested without changing its original source files. |
| 7. Result consolidation | Playwright JSON parsing, logs, insights, screenshots, videos, and traces | Each test result is associated with inspectable evidence, including passing tests. |

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

Command executed on 2026-07-26:

```text
npm.cmd test
```

Result: 2 of 2 tests passed.

- Provider normalization: validates local and hosted configuration requirements.
- Playwright report parsing: validates preservation of screenshots, videos, traces, and execution errors.

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
- A project with authentication, external APIs, or complex startup requirements may need manual runtime configuration.
- The current machine did not have an active Ollama or LM Studio model during the validation runs. Their adapters are implemented and covered by configuration tests, but the concrete E2E runs above used the local heuristic layer.
- Execution artifacts are intentionally ignored by Git because videos and traces are generated data. The run identifiers and file paths above make the local evidence directly traceable.

## Reproduction

```text
npm install
npx playwright install chromium
npm start
```

Open `http://127.0.0.1:4318`, select a project, review its criteria, generate the tests, then use **Run tests and collect evidence**. The results section presents the same evidence structure documented above.
