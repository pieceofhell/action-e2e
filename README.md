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
- choose which model layer will be used for semantic refinement;
- talk directly to the selected model through a contextual pipeline console.

## Architecture Summary

- `src/server.js`: local Express server and API.
- `src/services/project-inspector.js`: heuristic project inspection.
- `src/services/llm-provider.js`: integration with local or remote model providers.
- `src/services/ai-workflows.js`: model-assisted refinement during inspection, flow planning, and insight generation.
- `src/services/ai-console.js`: conversational console connected to the selected provider.
- `src/services/flow-planner.js`: flow and acceptance-criteria generation.
- `src/services/test-generator.js`: Playwright artifact generation.
- `src/services/test-runner.js`: target-project startup and test execution.
- `src/services/insight-builder.js`: baseline execution insight consolidation.
- `public/`: local graphical interface.
- `prototype-runs/`: artifacts generated per run without destructively changing the inspected project.

## How To Run

```bash
npm install
npx playwright install chromium
npm start
```

Then open [http://127.0.0.1:4318](http://127.0.0.1:4318).

## Providers And Models

The prototype now clearly separates the heuristic layer from the model layer:

- `Local heuristics`: internal fallback with no external model dependency.
- `Local Ollama`: for models served locally, such as `llama3.1:8b`, `openllama:8b`, or any other model exposed by the runtime.
- `OpenAI-compatible endpoint`: for a local or remote server that supports `chat/completions`.

Important notes:

- the prototype does not load model weights directly; it talks to a local or remote runtime;
- if the desired model does not appear in the dropdown, it can be typed manually;
- the heuristic reading layer still exists even when a model is selected.

## How The Model Participates In The Pipeline

- `Project inspection`: the local parser collects README, structure, manifests, routes, components, and UI hints; the model refines the summary, persona, and main capabilities.
- `Flows and criteria`: heuristics produce safe candidate flows; the model prioritizes them, rewrites them, and reduces ambiguity without inventing non-existent pages.
- `Test rendering`: once the user approves the flows, the Playwright files are rendered by a deterministic generator for better execution stability.
- `Results and insights`: execution data remains objective and local; the model only synthesizes interpretation, limitations, and next steps.
- `Model console`: the user can ask free-form questions to the same selected provider using a compact context built from the current project and pipeline state.

## End-To-End Flow

1. Select or paste the path to a local web project.
2. Choose the model layer that will be used for semantic refinement.
3. Load the project so the prototype can read the README, structure, manifests, and relevant files.
4. Review the automatic system summary, including framework, language, archetype, and suggested execution strategy.
5. Generate primary flows and acceptance criteria.
6. Manually approve the desired flows and review the generated criteria.
7. Adjust execution mode, startup command, and base URL when necessary.
8. Generate Playwright tests.
9. Run the pipeline and analyze reports, logs, screenshots, traces, and insights.

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
- `approved-flows.json`
- `runtime-config.json`
- `generated-tests.json`
- `playwright.config.cjs`
- `tests/*.spec.cjs`
- `results/playwright-results.json`
- `results/stdout.log`
- `results/stderr.log`
- traces, videos, and screenshots when relevant

## Supported Execution Strategies

- `static`: for static projects with `index.html`.
- `command`: for projects with a local startup command such as `npm run dev`.
- `external`: for applications already running outside the prototype.
- `manual`: analysis only, without execution.

## Current Scope

This first version prioritizes robustness and demonstrability:

- focus on web applications;
- Playwright as the default E2E tool;
- smoke-test generation and flow proposal based on project signals;
- human review before test generation;
- configurable semantic refinement by model;
- heuristic fallback when the project lacks enough context or the selected model fails.

## Known Limitations

- different models may vary in how reliably they follow the expected JSON format;
- very dynamic applications or applications that depend on real authentication may require manual adjustment of the startup command and base URL;
- the quality of generated tests depends on the richness of the signals found in the project;
- the current generation strategy favors safe smoke tests; deeper semantic assertions still depend on future pipeline expansion.
