# Risk-Guided QA Coverage

## Engineering review of 6 October 2026

- Execution now reports operational completion separately from the test result. Missing, malformed, partial and globally erroneous Playwright reports cannot appear as successful zero-test runs. Authenticated action-plan reports use the same result vocabulary.
- Coverage exposes the denominator and distinguishes actions exercised from criterion-linked verification. Reload alone is not credited as persisted behavior; a numerical change alone is not a domain calculation. No objectives means **not measurable**, not 100%.
- Generated guest tests store a criterion contract with ID, expectation provenance, action step, observed entity, comparison, evidence state IDs, and assertion ID. Edited criteria are parsed and validated again before generation; the UI invalidates stale tests. Unsupported criteria stay unverified, and the fallback check is labelled smoke. A model-inferred expectation remains marked as inferred, even when the resulting assertion detects a regression.
- Native browser dialogs are recorded with type, message, time, associated action and dismissal in exploration and replay; generated tests attach any dialogs to their report. A recorded alert can refute a no-feedback hypothesis without being misclassified as a runtime exception. Explicitly contradictory critic explanations no longer produce retained findings.
- A user-selected **disposable local target** profile enables fictional amounts from -1000 to 1000 with up to two decimal places, subject to the field's observed min/max/step. External and authenticated targets cannot enable it. The profile requires an isolated local target.
- The E2P server binds only to loopback, validates Host and Origin, and requires a local browser session for artifacts. Dependency overrides and lockfiles were updated; both npm and pnpm audits reported zero vulnerabilities at this revision. These are local hardening measures, not an absolute security guarantee.
- Run logs now include a code fingerprint and environment metadata. The blind command-line evaluator writes the same stage log schema as UI and batch runs. `npm run evaluate:aggregate` derives execution/application tables from identified logs rather than hand-entered counts.

The aggregator re-read both historical 21-project batch manifests and raw run logs: 1 October had 8 runs reach execution and 13/13 tests pass; 5 October had 18 reach execution, 28/28 tests pass, **105 completed actions and 92 recorded states**. The earlier 107/91 text was an arithmetic/reporting error. This recount does not make those historical tests semantically adequate or turn six unreviewed hypotheses into confirmed defects.

Development regression evidence is in `../output/e2p-evolution-20261006/regression-pairs/`. For the frozen Music Player journey, the older spec passed both correct and Prev-disabled targets; the new criterion assertion passed the correct target and failed by assertion on the mutant. For Expense Tracker, two tests compiled from a **programmatically recorded** correct-app journey passed together on the correct target; disabling balance updates failed only the balance test, and disabling storage failed only the reload-persistence test. These are known development cases, not blind discovery or a measured V0/V1 population result. The complete internal suite passed **130/130** tests. The article's historical October batches have not been rerun on this version.

## Batch evaluation and complete run logs

The workspace now has a batch queue for local project folders. Add the current folder, choose additional folders, or paste one absolute path per line. E2P validates and de-duplicates the paths, then processes the projects **sequentially** with the currently selected model. Each project goes through the same inspection, live exploration, grounded flow planning, generated Playwright tests, execution, and insight consolidation as an individual run. Its runtime is inferred independently; batch mode does not copy the current project's command settings to other projects.

Batch flow approval prefers model-grounded flows with medium or high confidence. If none qualify, E2P may approve **one limited observed-transition smoke test** in guest mode, but only when a planned flow cites the resulting state, a completed browser action changed the interface, the action has a stable locator, and the resulting value or visible control was actually observed. The original low-confidence criteria are **not** promoted: the generated test asserts the exact recorded outcome, and the run log marks `approvalBasis: observed-transition-only`. Time-only, unchanged, uncited, generic, unsafe, authenticated, or nondeterministic transitions do not qualify. If no safe transition exists, that job still stops explicitly.

Flow planning now sends a bounded digest of actions and before/after states to the model instead of repeating complete browser action catalogs after every step. Action-to-state IDs, input values, concise labels, and observed text are retained. This targets the 64k-context failures seen in `meal-finder` and `movie-seat-booking` without raising the model's configured context window.

Bug hypotheses now cite the exact recorded trigger step and action name. A candidate whose trigger is absent or mismatched is rejected before the model reviewer. Claims about clicking outside a modal require a recorded outside/backdrop action. Model-written diagnoses that merely repackage an already captured runtime exception are discarded as duplicates; the objective exception remains. These checks reduce unsupported causal claims, but do not make the remaining hypotheses confirmed defects.

The critic must also keep its factual gates consistent with its explanation, and a candidate is rejected if it explicitly says the same expected message was observed. Independent replay of a runtime exception now stops as soon as the matching diagnostic recurs; a later stale or unavailable control can no longer erase an already reproduced exception. If replay blocks *before* the exception recurs, the original direct browser error remains visible as an **observed but unconfirmed** diagnostic, with reduced confidence and the replay failure attached. A model-written hypothesis cannot reuse that untimed error to assign a specific action as its cause. Flow plans record the exact browser step that led to each cited state, so compiled tests do not accidentally replay later actions that return to that same state. Browser headings captured through DOM text are checked as visible heading text rather than assumed to be identical to the accessibility name of a heading containing nested controls.

### Validation on 2026-10-04

- The repository test suite completed with **115/115 passing**.
- Replanning the saved `meal-finder` and `movie-seat-booking` explorations with the same local 65,536-token model succeeded in both cases; both had previously failed because their planning requests exceeded the context limit. This checks planning only, not full end-to-end reruns of those applications.
- A fresh batch completed `form-validator` (1/1), `product-filtering` (1/1), and `memory-cards` (initially 1/2). The `memory-cards` failure was generated-test drift: a flow ending at a reused state replayed later unrelated actions and asserted a DOM heading as an exact accessibility name. After the step-binding and heading fixes, two independent `memory-cards` batch reruns passed 2/2 each.
- The final `memory-cards` run retained the browser exception as **observed, replay-blocked, unconfirmed**, while rejecting two model explanations that assigned its cause without time-linked evidence. Passing generated tests still do not imply the application is bug-free.
- Applying the strict observed-transition fallback to the saved plans of the prior 21-project batch would have yielded a limited test candidate for four of the ten projects previously blocked by low-confidence auto-approval; these four candidates compiled against their saved browser journeys. This is a retrospective policy check, **not** a claim that four additional full pipelines completed.

The **Skip human bug feedback** checkbox is enabled by default for unattended data collection. It does not confirm defects: retained findings remain AI hypotheses, with their evidence and reproduction gate visible in the run. If the checkbox is disabled, a job with hypotheses pauses after exploration. The user can review every hypothesis in Run history, then resume that job; other queued projects can proceed meanwhile. Human corrections remain separate from model output and are available to later analyses of the same project.

Every new run writes `prototype-runs/<run-id>/run-log.json`, including individual UI runs. It consolidates project understanding, live exploration and defect evidence, the complete proposed plan and auto/manual approvals, generated artifacts, execution results per test, visual-evidence references, stdout/stderr, insights, stage events, model identity, and any failure. Existing stage-specific artifacts remain in place. The history view and each batch job link to the full log. A failed or partial batch run retains the stages it reached rather than disappearing from the collection.

Batch metadata is stored in `prototype-runs/.batches/`; credentials and API keys are **not** persisted there. After a server restart, unfinished jobs are marked interrupted rather than silently retried with missing model credentials. Requeue those projects with the desired model settings. The run log captures curated progress and outputs, not hidden model chain-of-thought. Authenticated runs keep the existing quarantine and secret-handling boundaries.

This document describes the feature set added after the comparative project runs. The change targets the most important weakness observed in those runs: E2P could execute coherent happy paths while leaving a project's risky boundaries untouched, and a green generated suite could consequently look more conclusive than it was.

The implementation does not add modality-specific oracles. Audio, drawing, drag-and-drop, and similar modality judgments remain outside this change. The new layer instead improves the general pipeline used by simple and moderate web applications: project understanding, exploration, test-case planning, executable test generation, and honest result interpretation.

## What changed

### Project-grounded QA goals

Before model-guided exploration begins, `src/services/qa-coverage.js` derives a small risk map from evidence E2P already owns:

- repository synopsis, README excerpt, and selected source excerpts;
- detected application type and capabilities;
- the initial rendered page, visible text, and safe action catalog.

The planner can recognize general-purpose goals for primary input and activation, input commit, selection changes, internal navigation, overlay lifecycle, validation boundaries, timers, persisted state, and calculated state. A goal is created only when repository or browser evidence supports it. It is not a generic checklist applied blindly to every project.

Each goal has an ID, category, priority, rationale, required action type, status, and supporting step evidence. Status is one of `covered`, `partial`, or `uncovered`. The aggregate score is weighted by priority so that missing a high-risk boundary matters more than missing a low-priority interaction.

### Goal-guided browser exploration

The safe action catalog is now ranked against uncovered goals. The model sees:

- the remaining QA goals and their rationale;
- the exact safe actions that can contribute to each goal;
- a coverage score per action;
- completed actions, observed states, and earlier rejected decisions.

The adaptive exploration budget also considers the number of QA goals. A visually small application with several evidenced risks therefore receives enough steps to investigate them instead of being treated as a two-click page.

If the model tries to finish while useful goal-linked actions remain, that decision enters the existing structured-output repair cycle. E2P asks the model to correct the decision once and retains the rejection in the evidence record if correction fails.

### Boundary and state probes

Two safe browser-level actions were added:

- `wait`: observes an evidenced timer boundary. When visible text contains a value such as `Time left: 5s`, E2P waits just beyond that boundary, capped at 12 seconds.
- `reload`: compares state after a reload when repository evidence indicates browser persistence and a previous action changed the state.

These probes are not free-form model commands. E2P creates them deterministically, exposes fixed identifiers and bounded parameters, executes them itself, and records the resulting before/after states. They become available only when the associated risk exists.

### Model-latency isolation

Local models may take seconds or minutes to choose an action. That delay previously allowed countdowns, intervals, rotating content, and other time-dependent application behavior to advance while no user action was occurring.

For guest exploration, E2P now installs Playwright's browser clock before navigation. The application clock is paused only while the model request is in progress and resumed before executing the selected action. Metrics record whether isolation was enabled, how many pauses occurred, and the isolated wall-clock duration. Explicit `wait` probes still advance normally because they execute after the application clock resumes.

Authenticated exploration keeps its existing session behavior and does not install this clock layer.

### Test-case planning and Playwright generation

Flow planning receives the evaluated QA goals as a risk map. It is instructed to prefer evidence-backed high-priority boundary, temporal, persistence, calculation, and lifecycle journeys over redundant happy paths. An uncovered goal remains a reported gap; it is never permission to invent an unobserved flow.

Observed `wait` and `reload` steps compile into constrained Playwright alongside `click`, `fill`, `select`, and `press`. Locator validation continues to apply to DOM interactions, while browser-level probes require no fabricated selector.

### Honest result interpretation

Coverage is visible in the live-exploration summary and included in the objective context passed to result interpretation. Reports state:

- goals covered versus goals discovered;
- weighted coverage percentage;
- high-priority uncovered goals and risk areas;
- application-clock isolation metrics.

A passing generated suite is now described as evidence about its approved journeys only. It is not presented as a product-wide health verdict. High-priority gaps become explicit limitations and review actions.

### Test-grouped visual evidence

Execution evidence is presented as one expandable result per test instead of one unrelated card per artifact. Each result keeps its status and title in a single header, then places the screenshot and recording in a comparable media area and exposes the Playwright trace as a compact diagnostic action.

The gallery now:

- opens the first result and every failed result by default while collapsing the remaining successful tests;
- preserves the complete screenshot and video frame with `object-fit: contain` and a stable 16:9 viewport;
- shows artifact and test counts at a glance;
- adapts from a two-column media comparison to a single-column layout on narrow screens;
- percent-encodes individual artifact path segments so spaces, `#`, and other filename characters cannot break URLs;
- replaces broken browser media controls and image icons with an explicit unavailable state and a retry action.

This last behavior is especially useful when a page remains open after the local artifact server has stopped: cached evidence stays readable, while media that had not loaded yet no longer degrades into an unexplained broken thumbnail or `0:00` player.

### Wider workspace and QA palette

The visual refresh preserves the existing workflow, rounded cards, typography families, and evidence grouping. Blue identifies primary actions, teal provides secondary accents, and cool neutral surfaces replace the warm beige palette. Success, attention, and failure retain separate green, amber, and red colors with text labels.

Header, activity monitor, and workspace share fluid page gutters rather than nested fixed-width limits. At desktop sizes, cards use approximately 95% of the viewport width (1,824 px at a 1,920 px viewport). Typography grows gently from 16 to 19 px on larger displays; card padding scales with it. Form grids wrap according to available space and narrow screens retain 16 px outer margins.

### Run history and human feedback memory

The header's **Run history** button opens a searchable local archive. Existing runs are indexed from their artifacts, including older Playwright JSON reports, explorations, generated suites, and incomplete runs. Opening a historical result leaves the active project untouched and does not start a new run. Results include test outcomes, screenshots, recordings, traces, hypotheses, and available QA coverage. Quarantined authenticated runs are excluded until their evidence is released.

Each retained hypothesis has a **Human review** section, available both in the active exploration and the archive. A reviewer selects confirmed, expected behavior / false positive, environment problem, or inconclusive, and supplies a justification. Decisions are stored as immutable timestamped events in the run's `human-reviews/` directory. A correction adds another event; original model observations, claims, and previous reviews remain inspectable. Notes receive the existing credential-pattern redaction. No model credentials or authentication secrets are saved as history settings.

New runs store the resolved project path and creation time in `run-metadata.json`. The same normalized absolute path identifies a project across future runs (case-insensitive on Windows). Older runs can recover that identity from `inspection.json`. Moving a repository to another path currently starts a separate memory; matching by folder name alone is intentionally avoided.

Before defect discovery, E2P loads up to 20 latest distinct human reviews for that project, resolving exact repeated title/flow/expectation combinations to their newest decision. Both the hypothesis author and conservative critic receive those reviews as historical context. Notes are not executable instructions or current proof, and a prior decision does not automatically suppress or confirm a new hypothesis. The existing evidence and replay requirements still apply. Reports record the feedback entries supplied to the model and label such analyses `feedback-informed-model-guided`; this is retrieval of prior reasoning, not model training. Wording changes can leave related reviews as separate context entries.

History endpoints require the local request token, and reviews accept only hypothesis IDs already present in that run. Execution results are saved before final model enrichment, so an insight-generation failure does not hide completed tests from the archive. No previous benchmark run is automatically assigned a human verdict.

Validation includes legacy artifact loading, quarantine exclusion, project isolation, immutable review corrections, feedback included in the model request, and a browser journey that saves a review and retrieves it after reloading the page. These checks validate persistence and context delivery; they do not establish a measured reduction in model false positives yet.

### Discovery before defect assessment

Interface exploration now prioritizes learning ordinary user journeys with plausible fictional values. The discovery action catalog disables single-character boundary enforcement, and boundary goals are not used to rank its actions. Remaining QA goals provide context rather than a requirement to provoke errors. The explorer's predicted outcome is a tentative navigation expectation, not a bug oracle. Diagnostic collection and the separate post-exploration hypothesis/critic/replay phase remain active, including deterministic runtime-error hypotheses.

After visible validation, an already-used input can be corrected once and committed again. The correction gate checks the field's own validation feedback when available; an error on another field does not justify refilling a valid field. Attempts remain bounded and action safety policies still apply. Reports expose excluded controls and the reason discovery stopped instead of implying that all visible fields were exercised.

Flow admission now distinguishes observing a password-related validation message from proposing credential entry. Previously, a blanket keyword filter discarded even observed Username journeys whose expected results mentioned errors on other fields. Actual credential-entry proposals and unknown evidence references remain rejected. Invalid model JSON also enters the existing bounded decision-repair loop.

On the real Form Validator retest with the same Qwen model, discovery used `sampleuser` and Enter, retained no defect hypotheses, and generated two admitted flows. Email/password entry and direct Submit remain excluded by the current guest policy, so this is still a partial form journey. This update does not claim complete registration coverage or add an unrestricted adversarial browser agent.

## Data contract

`liveExploration.agenticExploration.qaCoverage` contains:

```json
{
  "version": 1,
  "goals": [
    {
      "id": "temporal-boundary",
      "title": "Observe a time-dependent boundary",
      "category": "temporal",
      "priority": "high",
      "status": "covered",
      "evidence": [{ "step": 3, "action": "Observe the interface across its timer boundary (6s)", "changed": true }]
    }
  ],
  "summary": {
    "total": 1,
    "covered": 1,
    "partial": 0,
    "uncovered": 0,
    "highPriorityUncovered": 0,
    "ratio": 1,
    "coveredGoalIds": ["temporal-boundary"],
    "uncoveredGoalIds": [],
    "riskAreas": []
  }
}
```

Every completed exploration action also records `coverageGoalIds` and, when relevant, `durationMs`.

## Safety boundaries

- The existing action safety classifier and authenticated read-only policy remain authoritative.
- Goal ranking cannot turn a blocked or unsafe control into a safe action.
- Timer waits are capped at 12 seconds.
- Reload is proposed only after a recorded state-changing action and project evidence of persistence.
- Failed or unavailable clock isolation produces a warning and does not falsify coverage.
- Uncovered risks remain visible; E2P does not manufacture actions, states, assertions, or success.

## Validation

The automated suite contains focused coverage for goal derivation, weighted evaluation, action ranking, synthetic probe gating, timer bounds, adaptive budgeting, browser-clock integration, browser-level execution, Playwright compilation, grouped evidence rendering, safe artifact URLs, and unavailable-media recovery. At the time of this update, the complete project suite passes **96 tests with 0 failures**.

## Remaining work

The feature materially improves exploration intent and the honesty of its output, but it does not solve defect discovery by itself. The most valuable next evaluations are:

1. rerun the same fixed project/model matrix and compare QA-goal coverage, unique transitions, useful test cases, false-positive rate, and confirmed-bug recall;
2. refine the static evidence vocabulary using failures observed in those runs, without turning it into project-specific rules;
3. add controlled repeated-action and event-order probes when they can be represented with the same bounded action protocol;
4. evaluate generated tests against historical faulty/fixed revisions and seeded mutations, keeping execution success separate from defect sensitivity.
