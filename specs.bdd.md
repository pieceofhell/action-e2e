# Action E2E Prototype: Behavioral Specification and Model Guide

## 1. Purpose

This document describes the user-visible and engineering behavior of Action E2E Prototype (E2P). The scenarios use Given/When/Then language as an architectural contract; they are not all executable Cucumber files.

E2P is AI-first. Repository parsers, browser instrumentation, validators, and Playwright compilers collect evidence and enforce safety, but they do not silently substitute prewritten semantic QA decisions when the selected model fails.

### Actors

- **Evaluator:** selects a project, configures a model, reviews flows, runs tests, and inspects evidence.
- **Model:** interprets the project, chooses exploratory actions, proposes flows and criteria, assists generation, and interprets results.
- **Evidence collector:** reads repository files and observes the rendered DOM without deciding which QA journeys matter.
- **Safety layer:** validates model decisions, blocks unsafe network activity, and compiles already executed model journeys.
- **Target application:** the web project under evaluation.

### Invariants

- A configured model is required for every semantic stage in a normal run.
- Live model-guided exploration must complete before flow planning or test generation.
- The first invalid, unsafe, or unexecutable exploration decision stops the pipeline.
- No heuristic flow, acceptance criterion, test, or insight silently replaces failed model output.
- Evidence collected before an interruption remains available and clearly labeled as partial.
- Only human-approved flows become tests.
- Generated artifacts never modify the target repository.
- Guest exploration blocks non-read HTTP requests; authenticated runs enforce stricter route and evidence policies.
- Authentication values never enter the UI, model prompt, generated code, logs, reports, or retained artifacts.
- Long-running operations expose their phase, elapsed time, progress, and recent milestones.

## 2. Feature: Configure the Experimental Model

```gherkin
Feature: Select the model that will be evaluated

  Scenario: Discover a local Ollama model
    Given Ollama is available at http://127.0.0.1:11434
    And at least one model has been downloaded
    When the evaluator refreshes providers
    Then E2P lists the installed models
    And prefers qwen3:8b when it is available

  Scenario: Use another supported provider
    Given the evaluator selects LM Studio, OpenRouter, Groq, Together AI, Hugging Face, or a custom compatible endpoint
    When a valid endpoint, model name, and required key are supplied
    Then the same AI-first stage contracts apply

  Scenario: Attempt a semantic stage without a model
    Given no valid provider and model are configured
    When the evaluator loads a project or requests another semantic stage
    Then that stage stops with a clear model-configuration error
    And no heuristic result is presented

  Scenario: A model returns malformed structured output
    Given a semantic stage requested JSON
    When the first response cannot be parsed
    Then E2P makes one constrained correction request
    And the stage stops if the corrected response is still invalid
```

### Explicit research control

Maintainers may start E2P with `E2P_ENABLE_BASELINE_MODE=1` to expose a non-AI comparison condition. This option is hidden by default, is never selected automatically, and must not be reported as model performance.

## 3. Feature: Select and Inspect a Project

```gherkin
Feature: Build evidence before browser exploration

  Scenario: Select a local directory
    Given E2P is running locally on Windows
    When the evaluator chooses a directory in the native folder dialog
    Then its absolute path is populated
    And manual path entry remains available if the operating system blocks the dialog

  Scenario: Understand a project with AI
    Given a valid model is configured
    And the selected directory contains a web project
    When the evaluator loads it
    Then E2P collects README, manifests, structure, routes, components, and runtime hints
    And the model produces the semantic synopsis, persona, and capabilities
    And E2P displays which facts came from repository evidence

  Scenario: Semantic inspection fails
    Given repository evidence has been collected
    When the model times out or remains malformed after correction
    Then project loading stops at semantic inspection
    And the repository evidence may remain available only as diagnostic context
```

## 4. Feature: Start and Explore the Interface

```gherkin
Feature: Let the model behave like a curious read-only user

  Scenario: Infer how to start a command-based project
    Given the repository contains a supported manifest, scripts, lockfile, or README command
    When E2P inspects runtime evidence
    Then it suggests the working directory, install command, start command, and base URL
    And every suggestion remains visible and editable

  Scenario: Perform model-guided guest exploration
    Given the target application responds at the effective base URL
    And guest access is selected
    When the evaluator starts live exploration
    Then Playwright opens an isolated Chromium context
    And E2P exposes only currently visible safe actions to the model
    And the model selects a safe action ID or finishes
    And E2P derives click, fill, select, or press Enter from the selected catalog entry
    And the model receives a fresh rendered state after every action
    And E2P records the action, rationale, expected result, state fingerprint, route, controls, and visible text
    And the sticky viewer shows the latest guest screenshot and recent action history while the model works

  Scenario: Explore a visually interactive control
    Given an element is not a semantic button but its same-origin CSS indicates a pointer interaction
    When the page is observed
    Then E2P can expose it as a bounded visual click action
    And a stable selector and occurrence index are retained for later compilation

  Scenario: Bound the experiment
    Given exploration is active
    Then E2P calculates an active budget from unique safe controls and discovered states
    And the active budget may grow when new interface behavior appears
    And 20 completed actions and 180 seconds remain hard safety ceilings
    And a simple interface may finish well before either ceiling

  Scenario: Normalize a model-invented action verb
    Given the model selects an action ID from the current safe catalog
    When its response also contains an unsupported or conflicting action verb
    Then E2P ignores that verb
    And it executes the canonical operation attached to the selected action ID
    And the protocol correction remains visible in the exploration evidence

  Scenario: Stop on an invalid model decision
    Given the model is choosing the next action
    When it returns an unknown or missing action ID, a sensitive input, an unsafe action, or an action that cannot execute
    Then E2P asks the same model to correct the decision once
    And exploration stops if the corrected response remains invalid
    And partial states and completed actions remain in the report
    And flow planning stays unavailable

  Scenario: Stop when the target fails
    Given exploration has started
    When the target stops responding, a linked route fails, or a development error overlay appears
    Then exploration stops with target diagnostics
    And no flows or tests are generated
```

The browser, not the model, executes actions. The model never supplies arbitrary JavaScript, selectors, routes, commands, or HTTP requests. Guest contexts permit only `GET`, `HEAD`, and `OPTIONS`, including in newly opened tabs.

### 4.1 Feature: Discover Potential UI Defects

```gherkin
Feature: Turn explored states into reviewable defect hypotheses

  Scenario: Review a focal state with transition context
    Given guest model-guided exploration produced distinct interface states
    When defect discovery reviews one focal state
    Then the local vision model receives one current viewport
    And structured evidence includes the immediate before and after states
    And every action includes its nearest card or product context when available

  Scenario: Keep facts separate from expectations
    Given the bug-hunter proposes a candidate
    Then its observed result cites real state or browser-error IDs
    And at least one cited fact explicitly describes the anomaly
    And its expected result names the source of the inference
    And the report marks the item as an unconfirmed hypothesis

  Scenario: Replay a retained observation in a clean session
    Given a guest hypothesis passed the evidence contract and conservative review
    When E2P replays the model-executed journey in a fresh browser context
    Then it compares the new interface state with the cited state
    And reports observation-reproduced, observation-diverged, or reproduction-blocked
    And it does not label the inferred expectation as an automatically confirmed defect

  Scenario: Reject a preference before model critique
    Given a candidate expects behavior only because of an interface convention or model preference
    When the evidence contract screens the candidate
    Then the candidate remains available in the rejected audit trail
    And it is not presented as an evidence-grounded potential defect

Feature: Preserve executed interaction coverage in generated flows

  Scenario: Distinct actions return to the same interface state
    Given the model executed two different meaningful controls
    And both controls produced the same terminal interface fingerprint
    When E2P asks the model to author flows
    Then both actions may be represented by distinct grounded flows
    And the plan reports covered and uncovered action opportunities

  Scenario: Compile an unambiguous generated test
    Given an approved flow reaches an observed evidence state
    When E2P generates Playwright
    Then it compiles only the actions actually executed by the model
    And every action passes the observed-locator contract
    And a generated selector failure is classified separately from a behavior assertion

  Scenario: Reject unsupported candidates
    Given a candidate describes normal empty-state behavior, an unexecuted action, or feedback contradicted by the screenshot
    When the conservative reviewer checks it
    Then the candidate is not shown as a retained potential defect
    And its title and rejection reason remain available as false-positive evidence

  Scenario: Review a candidate with an independently selectable model
    Given an author model proposed a potential defect
    And the evaluator configured a reviewer model
    When the candidate is reviewed
    Then E2P records author and reviewer confidence separately
    And retention requires executed-action, grounded-expectation, sufficient-evidence, and unmet-expectation gates
    And neither confidence label is presented as a calibrated probability

  Scenario: Exercise an unmarked creation boundary
    Given an ordinary creation field has no declared minimum length
    When the model selects that field during exploration
    Then E2P exposes a one-character boundary-probe constraint
    And the model chooses whether to execute the grounded action
    And any unchanged submission transition is preserved with the model's pre-action expected outcome

  Scenario: Confirm a historical failure with the same generated test
    Given a model journey produced a falsifiable Playwright oracle
    When the exact test fails on an affected revision and passes on its corrected revision
    Then E2P records the differential evidence separately from model confidence
    And a human can adjudicate retained hypotheses as confirmed or false positive

  Scenario: Preserve a potential defect report
    Given discovery completes
    Then E2P writes results/potential-bugs.json in the same run used for generated tests
    And the UI displays reproduction steps, observed facts, inferred expectations, severity, confidence, screenshots, and reviewer reasoning
```

## 5. Feature: Propose QA Flows and Acceptance Criteria

```gherkin
Feature: Convert observed behavior into reviewable QA intent

  Scenario: Generate evidence-grounded flows
    Given model-guided exploration completed without invalid or failed actions
    When the evaluator requests a plan
    Then the model receives the observed state graph and action transitions
    And it proposes up to four distinct QA flows
    And each flow cites exact evidence state IDs
    And each Given/When/Then criterion refers only to observed routes, controls, inputs, or text

  Scenario: Reject an invented or causally unrelated flow
    Given a proposed flow cites a terminal state
    When that state was produced by an unrelated action or its criteria invent unsupported behavior
    Then the flow is rejected
    And the stage stops only if no admissible model-authored flow remains

  Scenario: Human review
    Given grounded flows are visible
    When the evaluator edits criteria and approves selected flows
    Then only those approved flows can be sent to generation
```

The ordinary guest planner begins with no predefined flow templates. Repository identity is isolated in the prompt to reduce cross-project leakage, and terminal-state diversity is requested when exploration discovered multiple changed states.

## 6. Feature: Generate Playwright Tests

```gherkin
Feature: Render model-derived journeys as executable tests

  Scenario: Accept grounded model-authored Playwright
    Given an approved flow cites completed model exploration
    When the model authors a safe Playwright body grounded in that flow's states
    Then E2P validates navigation, locators, assertions, awaiting, and read-only behavior
    And saves the body as model-assisted

  Scenario: Compile an executed model journey
    Given free-form model code fails structural validation
    And the approved flow cites a journey the model actually executed
    When generation continues
    Then E2P compiles all prerequisite observed actions into Playwright
    And uses stable test IDs, DOM IDs, accessible names, labels, placeholders, visual selectors, and occurrence indices from evidence
    And records the mode as model-journey-compiled

  Scenario: No grounded journey can be generated
    Given free-form model code is rejected
    And no exact executed journey supports the approved flow
    Then generation stops
    And no generic smoke test replaces it
```

`model-journey-compiled` is AI-derived: the model chose and executed the semantic journey, while trusted code translated that recorded journey into safe Playwright. It is not heuristic QA planning.

## 7. Feature: Execute and Review Evidence

```gherkin
Feature: Evaluate generated tests transparently

  Scenario: Execute generated guest tests
    Given a generated run contains only supported AI-derived modes
    When the evaluator starts execution
    Then E2P starts or connects to the target
    And Playwright executes the approved tests
    And pass, fail, duration, logs, screenshots, videos, and traces are indexed

  Scenario: Reject unsupported artifacts
    Given a run contains an unrecognized or baseline generation mode
    When normal AI-first execution is requested
    Then execution stops before Playwright runs

  Scenario: Interpret objective results
    Given execution evidence exists
    When E2P requests semantic consolidation
    Then the model receives objective measurements and sanitized errors
    And proposes limitations and next steps
    And a model failure is reported instead of replaced by deterministic insights
```

## 8. Feature: Authenticated Read-Only Evaluation

```gherkin
Feature: Evaluate protected interfaces without exposing credentials

  Scenario: Configure an authentication profile
    Given a credential exists in an E2P_AUTH_* process environment variable or secret injector
    When the evaluator selects a trusted adapter and enters only the variable name
    Then the UI can report configured or missing
    But it never receives the credential value

  Scenario: Explore a protected route
    Given authentication preparation succeeds
    And the route is explicitly allowlisted
    When the protected interface is observed
    Then navigation and read-only assertions are permitted
    And mutations, external origins, unsafe paths, traces, videos, headers, cookies, and payload logging are blocked

  Scenario: Prevent credential retention
    Given an authenticated run produced evidence
    When artifact quarantine scans every file
    Then files containing an active secret are removed
    And the run is released only after the scan passes
```

Detailed adapter and security behavior is maintained in [`features/auth.md`](features/auth.md).

## 9. Model Selection Guidance

The model should be selected according to the experiment rather than treated as a hidden implementation detail.

| Target characteristic | Suggested starting model | Rationale |
| --- | --- | --- |
| General local web UI, 16 GB or more practical memory | `qwen3:8b` | Produced the deepest current exploration and passing tests, but also showed action-contract and result-interpretation instability that should be measured across repetitions. |
| Screenshot-grounded UI exploration on a local runtime | `qwen2.5vl:7b` | Completed the third-party Fake Store exploration with 20 actions and 11 states. One screenshot plus compact transition summaries per model call kept all 11 defect reviews within the configured context. |
| Code-heavy repository and Playwright drafting | `qwen2.5-coder:7b` | Coding specialization, but action-contract adherence must still be measured. |
| General instruction-following comparison | `llama3.1:8b` | Useful independent local-model comparison. |
| More available memory and broader semantic summaries | `gemma3:12b` | Larger local profile; structured-output reliability must be verified per stage. |
| Constrained hardware | A smaller local model or hosted compatible model | Latency and JSON adherence should be reported, not hidden by fallback. |

The same target should be repeated with fixed runtime settings and, where supported, controlled model parameters. Compare completion rate, valid-action rate, explored-state diversity, flow grounding, generated-test count, pass rate, latency, and reviewer judgment. A stopped run is a valid experimental result.

## 10. Extension Checklist

An extension is complete only when:

- new evidence is distinguishable from model inference;
- the model receives only bounded current actions;
- unsafe behavior is blocked below the model;
- malformed or ungrounded output stops the relevant stage;
- partial evidence survives interruption;
- human approval remains before generation;
- generated artifacts identify their AI-derived mode;
- unit, browser integration, and candidate regressions cover success and failure;
- documentation states what was actually validated.

## 11. Demonstration Sequence

1. Start Ollama and confirm the intended model is installed.
2. Start E2P and select the provider and model.
3. Choose a target project and review inferred runtime settings.
4. Run live exploration and follow its activity monitor.
5. Inspect model actions, states, coverage, or the explicit stop reason.
6. If exploration completed, request flows and review their cited evidence.
7. Approve selected criteria and generate tests.
8. Execute the tests and open screenshots, videos, and traces.
9. Use [`AI_FIRST_CANDIDATE_REPORT.md`](AI_FIRST_CANDIDATE_REPORT.md) to compare completed and interrupted candidate runs without heuristic substitution.
