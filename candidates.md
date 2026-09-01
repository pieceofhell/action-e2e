# E2P Candidate Projects and Experimental Runs

> **Current protocol (August 16, 2026):** E2P uses an AI-first fail-fast contract with action-ID normalization and adaptive exploration budgets. The latest comparable results are in [`AI_FIRST_CANDIDATE_REPORT.md`](AI_FIRST_CANDIDATE_REPORT.md). Older sections below are retained as historical development evidence and include heuristic fallbacks that are no longer available in the normal pipeline.

## Current AI-First Validation

Current runs use guest access. The original comparison used `qwen3:8b`; the multimodal Fake Store run used `qwen2.5vl:7b`. A stopped run is an experimental result, not a failed attempt that E2P hides: no heuristic flow or test is generated after a model-contract violation.

| Candidate | Model exploration | AI-derived execution | Current outcome |
| --- | ---: | ---: | --- |
| Janvas | 6 actions, 4 states | 1/1 passed | Completed end to end. Invented dashboard/tool proposals were rejected; one observed privacy-policy journey remained admissible and passed. |
| Dopa | 1 action, 1 state | Not reached | Latest repetition stopped when the model requested `click` for a fill-only control; an earlier run completed 20 actions and passed 2/2. |
| MDN To-do Notifications | 6 actions, 2 states | Not reached | Stopped on an action ID absent from the current safe set. |
| TodoMVC React | 5 actions, 4 states | 3/3 passed | Completed end to end with create, completion, and filter journeys plus visual evidence. |
| Form Validator | 2 actions, 2 states | Not reached | Stopped on an action ID absent from the current safe set. |
| Movie Seat Booking | 9 actions, 9 states | Not reached | Selected a movie and eight seats, then stopped on an action-kind mismatch. |
| Fake Store | 20 actions, 11 states | 1/1 passed | Completed the blind multimodal pipeline. The latest reviewer retained eight hypotheses, but human review confirmed none and identified a high false-positive rate. |

These outcomes prove two complementary properties. E2P can produce and execute useful model-derived tests when the model follows the contract, and it no longer converts a model failure into a misleading generic success. Janvas demonstrates strict rejection of hallucinated flows without discarding a smaller grounded plan, while TodoMVC demonstrates multiple stateful journeys completing end to end. Dopa's differing repeated outcomes continue to expose repeatability as a concrete research variable.

## 1. Purpose

This document identifies small web applications that are useful as toy examples for Action E2E Prototype (E2P), explains why each candidate adds experimental value, and records the results of comparable pipeline runs.

The candidates were not selected only because they are easy to start. Together they exercise different sources of difficulty:

- static and command-based runtimes;
- a nested web application inside a monorepo;
- forms and negative validation behavior;
- route navigation;
- local persistence and state-dependent controls;
- visual interactions with weak accessibility semantics;
- interfaces that require external credentials for deeper journeys.

The suite is intentionally heterogeneous. A toy example is most useful when it can expose a limitation in the pipeline as well as demonstrate a passing case.

## 2. Evaluation Protocol

All final runs in this report were executed on August 11, 2026 with the same configuration:

- E2P running locally at `http://127.0.0.1:4318`;
- local Ollama provider;
- model `llama3.1:8b`;
- static repository inspection followed by live Playwright exploration;
- AI-augmented flow and acceptance-criteria planning;
- up to three candidate flows whose confidence was not `low`;
- no manual rewriting of the generated criteria during the experiment;
- model-authored test bodies accepted only after the existing structural and grounding checks;
- Playwright screenshot, video, and trace collection for every test;
- generated artifacts isolated under `prototype-runs/<run-id>/`.

This is an exploratory comparison, not a controlled model benchmark. The applications expose different numbers and types of controls, and E2P currently chooses flows according to the evidence available in each project.

## 3. Candidate Summary

| Candidate | Technology/runtime | Main experimental dimension | Final result |
| --- | --- | --- | ---: |
| Janvas guest baseline | Next.js/TypeScript monorepo, command mode | Nested manifest, onboarding state, routes | 1/3 passed |
| Janvas authenticated read-only | Next.js/TypeScript monorepo, trusted adapter | Protected routes, secret isolation, visual evidence | 2/2 passed |
| MDN To-do Notifications | Static HTML/JavaScript | Rich form semantics, IndexedDB, notifications | 3/3 passed |
| TodoMVC React | React/Webpack, command mode | Stateful CRUD, filters, routes, hidden controls | 1/2 passed |
| Form Validator | Static HTML/CSS/JavaScript | Negative validation, labels, error messages, password fields | 1/3 passed |
| Movie Seat Booking | Static HTML/CSS/JavaScript | Visual selection, calculated totals, localStorage, weak semantics | 1/1 passed |
| Dopa | Vinext/TypeScript, command mode | Vite loopback resolution, commerce UI, accessible names | 1/1 passed |
| Fake Store | React/Vite, command mode | Unknown third-party commerce UI, blind multimodal defect hypotheses | 1/1 passed; 0 retained defects |
| **Aggregate** | Mixed | 13 generated tests | **8/13 passed (61.5%)** |

Generation provenance across the suite:

| Generation path | Generated | Passed | Observed pass rate |
| --- | ---: | ---: | ---: |
| Model-assisted body accepted by validation | 4 | 1 | 25.0% |
| Deterministic/heuristic fallback | 9 | 7 | 77.8% |

These figures must not be interpreted as a general comparison between AI and deterministic testing. They describe this small set, this model, and the current guardrails. They do show that passing structural validation is not yet enough to guarantee correct state sequencing or locator composition.

## 4. Janvas

### Overview

Repository: [pieceofhell/canvas-wrapper-test](https://github.com/pieceofhell/canvas-wrapper-test)

Janvas is a web wrapper for the Canvas learning platform. The selected repository is a monorepo with a Next.js web application under `apps/web`. Its interface includes onboarding, Canvas URL and API-key configuration, a privacy-policy route, and deeper Canvas-oriented functionality after connection.

### Why it is a strong toy example

- It is the primary domain example for E2P rather than a generic demo.
- It verifies whether repository inspection can identify a nested web manifest instead of selecting a mobile or root workspace incorrectly.
- It requires command orchestration rather than a static file server.
- Its initial journey is state-dependent: a new user may see a welcome screen, while another state may expose account connection.
- It offers internal navigation to a privacy route and an external documentation link.
- Its credential-dependent features create a clear boundary between safe smoke testing and flows that require controlled fixtures or secrets.
- It is complex enough to reveal real pipeline limitations while still being locally demonstrable.

### Run configuration and result

- Run ID: `canvas-wrapper-test-2026-08-11T21-07-01-453Z`
- Detected stack: TypeScript, Next.js, dashboard archetype, high confidence.
- Selected manifest: `apps/web/package.json`.
- Automatically inferred runtime: `bun run dev`, working directory `apps/web`, base URL `http://127.0.0.1:3000`.
- Live exploration: completed; two routes observed (`/` and `/privacy`).
- Approved flows: main rendering, primary actions, and privacy-policy navigation.
- Generation: three deterministic fallbacks. Model drafts were rejected for generic roles or for returning a complete nested test.
- Result: **1 passed, 2 failed**.
- Passing flow: privacy-policy route.
- Failed flows: main-interface rendering and primary-action review.

The failures were caused by a state mismatch between exploration and execution. Live exploration observed the `Connect your Canvas account` state with a `Show` button, while execution opened the `Welcome to Janvas` state with `Start with Janvas`. The screenshot proves that the app was available; the generated oracle represented the wrong initial state.

This result identifies a high-value E2P requirement: live exploration should preserve or explicitly model browser state, and generated criteria should support alternative initial states instead of assuming that one observation is universal.

### Authenticated read-only validation

The new authenticated pipeline was evaluated against Janvas using its deterministic acceptance provider. E2P received only the name of a process environment reference; a random runtime canary supplied the non-production token value. The browser UI, model context, generated action plans, reports, and documentation never received that value.

- Run ID: `canvas-wrapper-test-2026-08-11T22-45-34-579Z`
- Adapter: `janvas-canvas-token`.
- Runtime: `npm.cmd run dev -- --hostname 127.0.0.1 --port 3112`, working directory `apps/web`.
- Access mode: authenticated read-only.
- Allowlisted routes: `/profile` and `/inbox`.
- Live exploration: completed with both protected routes observed and session status `verified`.
- Generated artifacts: two schema-constrained `*.actions.json` plans; no credential-aware JavaScript.
- Result: **2 passed, 0 failed** in 3.2 seconds.
- Evidence: two post-authentication screenshots showing the profile and inbox fixtures.
- Network policy: two external avatar-image requests blocked; zero mutating requests delivered.
- Secret validation: passed across 15 files; the run was released from quarantine.
- Trace and video: intentionally disabled for the authenticated session.

This run resolves the earlier guest-state mismatch for protected coverage without preserving a reusable browser state. It also demonstrates that E2P can distinguish public onboarding tests from authenticated navigation while applying stricter evidence and execution rules to the latter.

Local evidence:

- `prototype-runs/canvas-wrapper-test-2026-08-11T21-07-01-453Z/results/playwright-results.json`
- `prototype-runs/canvas-wrapper-test-2026-08-11T21-07-01-453Z/results/visual-evidence.json`
- `prototype-runs/canvas-wrapper-test-2026-08-11T21-07-01-453Z/results/test-artifacts/`
- `prototype-runs/canvas-wrapper-test-2026-08-11T22-45-34-579Z/results/auth-execution.json`
- `prototype-runs/canvas-wrapper-test-2026-08-11T22-45-34-579Z/results/test-artifacts/`

## 5. MDN To-do Notifications

### Overview

Repository example: [mdn/dom-examples/to-do-notifications](https://github.com/mdn/dom-examples/tree/main/to-do-notifications)

This MDN example is a static task-scheduling application. It combines a title field, date/time controls, an add action, IndexedDB-backed entries, and browser notification enablement.

### Why it is a strong toy example

- The source is small and can be served without dependency installation.
- Labels, headings, buttons, and form controls are explicit and accessible.
- It contains both ordinary inputs and select controls.
- It provides meaningful state mutation without requiring a backend.
- IndexedDB and notification behavior create optional advanced paths beyond the initial smoke test.
- It is a useful positive control: if E2P struggles here, the issue is unlikely to be repository size or runtime complexity.

### Run configuration and result

- Run ID: `to-do-notifications-2026-08-11T21-05-19-732Z`
- Detected stack: static web application, form-centric archetype, high confidence.
- Runtime: internal static server.
- Live exploration: completed; one route, two headings, two buttons, one form, and seven control signals observed.
- Approved flows: main rendering, primary actions, and primary form review.
- Generation: one model-assisted body and two deterministic fallbacks.
- Result: **3 passed, 0 failed**.
- Evidence: screenshot, video, and trace for all three tests.

MDN produced the strongest run because the rendered interface exposes rich semantic evidence. It demonstrates the value of accessible labels and named controls for both criteria generation and locator construction.

Local evidence:

- `prototype-runs/to-do-notifications-2026-08-11T21-05-19-732Z/results/playwright-results.json`
- `prototype-runs/to-do-notifications-2026-08-11T21-05-19-732Z/results/visual-evidence.json`
- `prototype-runs/to-do-notifications-2026-08-11T21-05-19-732Z/results/test-artifacts/`

## 6. TodoMVC React

### Overview

Repository example: [tastejs/todomvc/examples/react](https://github.com/tastejs/todomvc/tree/master/examples/react)

TodoMVC implements the same task-management behavior across many JavaScript frameworks. The React version supports adding, editing, completing, filtering, and clearing tasks, with client-side routing and persistent state. TodoMVC also publishes a common behavioral specification, which makes it especially suitable for comparing generated criteria against known requirements.

### Why it is a strong toy example

- It is a canonical and widely understood UI benchmark rather than an arbitrary tutorial repository.
- Its public application specification can serve as an external reference oracle.
- The main flow has several state transitions: empty list, item creation, completion, filtering, editing, and removal.
- Some controls appear only after state changes, which tests whether criteria and selectors respect sequencing.
- React, Webpack, and React Router exercise a command runtime different from Janvas.
- The same behavior exists in other framework implementations, enabling future cross-framework experiments with equivalent requirements.

### Historical defect pair evaluated on August 23, 2026

An older React implementation supplies a public one-line bug-fix pair: parent `64ee2028` and fix `9386c868`, whose commit reports inconsistent item checkboxes after using toggle-all. E2P created detached worktrees, served both snapshots without editing them, created two tasks, and clicked toggle-all twice.

The defect did not reproduce in current Chromium: both snapshots kept the checkbox properties, completed-item classes, and active count synchronized. The pair was classified as `bug-not-detected`. This candidate remains valuable as a negative historical case showing that old browser/framework bugs may disappear under modern runtime semantics and that commit metadata alone is not proof that a benchmark remains executable. It must not be counted as a discovered bug.

### Runtime-inference finding

The first startup attempt exposed an E2P defect. The inspector selected `npm run dev` but inferred port `7002` from the unrelated `serve` script. That URL did not respond. E2P was corrected so the base URL is derived only from the selected startup script, with Webpack Dev Server recognized at port `8080`. A regression test was added and the internal suite increased from four to five passing tests.

### Final run configuration and result

- Run ID: `react-2026-08-11T21-01-32-777Z`
- Detected stack: JavaScript, React, form-centric archetype, high confidence.
- Corrected runtime: `npm run dev`, base URL `http://127.0.0.1:8080`.
- Live exploration: completed; the `todos` heading and new-todo input were observed.
- Approved flows: main rendering and primary form review.
- Generation: one deterministic fallback and one model-assisted body.
- Result: **1 passed, 1 failed**.
- Passing flow: main-interface rendering.
- Failed flow: model-assisted primary form review.

The failed test expected `Clear completed` to be visible before any task had been created or completed. The element existed in the DOM but was hidden. This is not an application defect; it is a pipeline false positive. The case demonstrates that text grounding must include visibility and state preconditions, not only string presence.

Local evidence:

- `prototype-runs/react-2026-08-11T21-01-32-777Z/results/playwright-results.json`
- `prototype-runs/react-2026-08-11T21-01-32-777Z/results/visual-evidence.json`
- `prototype-runs/react-2026-08-11T21-01-32-777Z/results/test-artifacts/`

## 7. Form Validator

### Overview

Repository example: [bradtraversy/vanillawebprojects/form-validator](https://github.com/bradtraversy/vanillawebprojects/tree/master/form-validator)

Form Validator is a small registration form written with HTML, CSS, and JavaScript. It contains username, email, password, and password-confirmation fields and renders validation feedback for missing, malformed, short, or mismatched values.

### Why it is a strong toy example

- It is minimal enough that expected behavior can be manually audited.
- It emphasizes negative paths and validation oracles instead of only successful navigation.
- Labels and placeholders are both present, allowing locator-strategy comparison.
- Password confirmation introduces a relationship between fields.
- Error messages change according to input, making it useful for testing semantic assertions.
- It exposes whether E2P distinguishes registration from authentication.

### Run configuration and result

- Run ID: `form-validator-2026-08-11T21-02-51-453Z`
- Detected stack: static HTML application, classified as authentication, high confidence.
- Runtime: internal static server.
- Live exploration: completed; heading, submit button, four labeled inputs, and one form observed.
- Approved flows: main rendering, authentication-screen presence, and basic authentication validation.
- Generation: two model-assisted bodies and one deterministic fallback.
- Result: **1 passed, 2 failed**.
- Passing flow: deterministic validation fallback.
- Failed flows: the two model-assisted tests.

The model constructed invalid chained locators: `getByLabel('Username').locator('label')` and `getByLabel('Username').getByPlaceholder('Enter username')`. Each individual string was grounded, so the current validator accepted the body, but the locator relationships were wrong. The run also shows that password fields alone should not force an authentication archetype when registration signals are stronger.

This candidate directly motivates two improvements: validation of locator composition and a separate registration/form-validation archetype.

Local evidence:

- `prototype-runs/form-validator-2026-08-11T21-02-51-453Z/results/playwright-results.json`
- `prototype-runs/form-validator-2026-08-11T21-02-51-453Z/results/visual-evidence.json`
- `prototype-runs/form-validator-2026-08-11T21-02-51-453Z/results/test-artifacts/`

## 8. Movie Seat Booking

### Overview

Repository example: [bradtraversy/vanillawebprojects/movie-seat-booking](https://github.com/bradtraversy/vanillawebprojects/tree/master/movie-seat-booking)

Movie Seat Booking is a static JavaScript interface where the user chooses a film, selects available seats, and sees the selected-seat count and total price update. The chosen movie and seats are persisted in localStorage.

### Why it is a strong toy example

- Its core behavior is highly visual and action-oriented.
- Seat selection requires distinguishing available, selected, and occupied elements.
- Price and count are observable derived-state oracles.
- localStorage permits persistence checks without a backend.
- The seats are plain styled `div` elements, creating an intentional accessibility and selector challenge.
- It tests whether live exploration can discover meaningful interactions that do not use buttons, links, or ordinary form controls.

### Run configuration and result

- Run ID: `movie-seat-booking-2026-08-11T21-04-14-068Z`
- Detected stack: static HTML application, generic-web archetype, medium confidence.
- Runtime: internal static server.
- Live exploration: completed; one movie select was observed, but no named buttons, links, or headings.
- Approved flows: main-interface rendering only.
- Generation: deterministic fallback after the model proposed an interaction not grounded in safe hints.
- Result: **1 passed, 0 failed**.
- Evidence: screenshot, video, and trace.

The green result represents limited coverage. E2P verified that the page rendered but did not exercise seat selection, count, price, occupied-seat protection, movie changes, or persistence. This is valuable evidence: accessibility semantics and action discovery constrain generated-test depth even when the application is operational.

Local evidence:

- `prototype-runs/movie-seat-booking-2026-08-11T21-04-14-068Z/results/playwright-results.json`
- `prototype-runs/movie-seat-booking-2026-08-11T21-04-14-068Z/results/visual-evidence.json`
- `prototype-runs/movie-seat-booking-2026-08-11T21-04-14-068Z/results/test-artifacts/`

## 9. Dopa

### Overview

Local project: `C:\Users\henri\Documents\dopa`

Dopa is a mobile-first fictional shopping showcase implemented with TypeScript and Vinext, a Vite-based compatibility layer for Next.js applications. Users can browse products, search, filter categories, favorite items, and inspect a fictional cart without real purchasing or delivery.

### Why it is a strong toy example

- Vinext broadens runtime coverage beyond conventional Next.js, Webpack, and static servers.
- Its development server advertises `localhost:3000` and listened on IPv6 in the observed environment, exposing assumptions about `127.0.0.1`.
- The commerce domain is clearly documented but includes an incidental authentication helper, testing archetype prioritization.
- Product and cart controls provide rich accessible names, including dynamic item counts.
- The interface has enough repeated controls to reveal whether generated semantic locators are exact or ambiguous.

### Findings and corrections

The initial live exploration failed because E2P inferred `http://127.0.0.1:3000`, while Vinext was listening through `localhost`/IPv6. The failed startup also left an orphan process. Runtime orchestration was changed to detect Vinext, parse announced loopback URLs, probe localhost/IPv4/IPv6 equivalents, report sanitized startup output, and terminate failed process trees.

The first generated render test then exposed a second issue: visible text `Carrinho` was converted into a partial regular expression that matched the cart button and every product's “add to cart” button. Live exploration now preserves `aria-label`, and deterministic generation uses the exact observed accessible name.

Visual review of the next nominally passing run exposed a Vite runtime overlay caused by missing local `ASSETS` and `IMAGES` bindings in Dopa. E2P now records development overlays as degraded live evidence and every guest spec asserts that no known runtime overlay is present. Dopa's Vite configuration was aligned with the bindings generated by its installed Vinext version.

### Final run configuration and result

- Run ID: `dopa-2026-08-11T23-26-07-771Z`.
- Detection: Vinext, TypeScript, commerce, high confidence.
- Runtime: `npm run dev`, base URL `http://localhost:3000`.
- Live exploration: completed and healthy; one route, eight headings, visible category/product actions, one search input, and no runtime overlay.
- Approved flow: main interface rendering.
- Result: **1 passed, 0 failed** in 2.9 seconds.
- Evidence: screenshot, video, and Playwright trace.
- Cleanup: no listener remained on port 3000.
- Target checks: Vinext build, 6/6 Dopa tests, and ESLint passed. The target dependency audit still reports four high-severity transitive advisories; the available complete fix upgrades the exact Next.js dependency and was not forced during this E2P correction.

Local evidence:

- `prototype-runs/dopa-2026-08-11T23-26-07-771Z/results/playwright-results.json`
- `prototype-runs/dopa-2026-08-11T23-26-07-771Z/results/visual-evidence.json`
- `prototype-runs/dopa-2026-08-11T23-26-07-771Z/results/test-artifacts/`

## 10. Fake Store

### Overview and selection rationale

[`devamir99/fakestore-app`](https://github.com/devamir99/fakestore-app) is a React 19 and Vite storefront with search, categories, product details, favorites, cart, quantity controls, theme switching, and multiple routes. It is not authored by the E2P contributors, runs locally without a backend, and exposes enough state transitions for nontrivial exploratory QA.

The evaluated revision was `8e205db216ad16b370761e65274fad151b73f85e`. Selection and execution did not use issues, known defect descriptions, fix commits, or project-specific flow rules.

### Final blind run

- Model: local Ollama `qwen2.5vl:7b`.
- Run: `fakestore-app-2026-08-23T23-24-04-964Z`.
- Exploration: 20 actions, 11 states, 44 viewport screenshots.
- Exercised behavior: cart and Favorites empty states, collection browsing, search and clearing, theme, product details, category filters, quantity controls, About, and navigation back to the shop.
- Defect review under the latest evidence-gate contract: 11/11 state reviews completed, eight hypotheses retained, zero human-confirmed defects.
- Browser diagnostics: zero console errors and zero page errors.
- Planning: one admissible evidence-grounded flow.
- Generation: one Playwright artifact, compiled from the executed model journey after the free-form draft was rejected.
- Execution: 1/1 passed in 8.3 seconds after E2P corrected an ambiguous repeated-link locator exposed by the initial execution.

The retained candidates are mostly false positives: correct empty-state copy, unsupported search-clearing expectations, and controls that were visibly interactive. This latest reanalysis demonstrates that reviewer confidence is not calibrated and that retention must not be interpreted as confirmation.

The run demonstrates generalized pipeline execution, but not adequate false-positive control. No Fake Store hypothesis was confirmed. The public historical TodoMVC benchmark in [`BUG_DISCOVERY_TRIAL_REPORT.md`](BUG_DISCOVERY_TRIAL_REPORT.md) supplies the separate red/green defect proof.

See [`EXTERNAL_BLIND_EVALUATION_REPORT.md`](EXTERNAL_BLIND_EVALUATION_REPORT.md) for the complete run history and artifacts.

## 11. Five-Repository Public Benchmark

Five additional repositories were selected without consulting known defect reports. They broaden the candidate set with delayed overlays, multi-screen quizzes, dense control catalogs, semantic task management, and timer-driven state changes.

| Candidate | Application profile | Final result under the corrected pipeline |
| --- | --- | --- |
| [`codewithsadee/anon-ecommerce-website`](https://github.com/codewithsadee/anon-ecommerce-website) | Static storefront with menus, search, repeated product controls, and a delayed promotional overlay. | 20 actions, 13 states, current scenario 1/1 passed; no evidence-supported target defect. |
| [`jamesqquick/Build-A-Quiz-App-With-HTML-CSS-and-JavaScript`](https://github.com/jamesqquick/Build-A-Quiz-App-With-HTML-CSS-and-JavaScript) | Vanilla JavaScript quiz with progress, score, and high-score screens inside a tutorial collection. | 12 actions, 11 states, 1/1 passed; no evidence-supported target defect. |
| [`cypress-io/cypress-example-kitchensink`](https://github.com/cypress-io/cypress-example-kitchensink) | Interaction catalog containing repeated links, forms, buttons, checkboxes, and navigation examples. | 12 actions, nine states, corrected scenario 1/1 passed; no evidence-supported target defect. |
| [`mdn/todo-react`](https://github.com/mdn/todo-react) | Accessible React task manager with creation, filtering, completion, editing, and deletion. | 19 actions, 17 states; expanded plan 5/5 passed at 42% observed-opportunity coverage. |
| [`TheNarh/The-React-Quiz`](https://github.com/TheNarh/The-React-Quiz) | Timed React quiz whose available controls change as the countdown progresses. | Four completed actions, nine states, 1/1 passed; no evidence-supported target defect. |

These targets exposed general E2P weaknesses in dynamic-action recovery, inferred package managers, flow deduplication, semantic locator compilation, terminal assertions, and hypothesis screening. The corrections are part of the ordinary pipeline and contain no target-specific rules. Across the sample, 25 initially plausible defect hypotheses were rejected by the current evidence contract. Twelve underlying observations were reproducible, but reproduction did not support the inferred expectation; 13 replays were blocked by transient or accumulated state.

The complete protocol, revision identifiers, per-project run IDs, aggregate metrics, and local evidence paths are in [`PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md`](PUBLIC_REPOSITORIES_BENCHMARK_REPORT.md).

## 12. Cross-Candidate Findings

### 12.1 What worked

- E2P loaded and inspected all six candidates.
- Runtime mode was correctly separated between static and command targets after the TodoMVC fix.
- Vinext loopback resolution worked across localhost, IPv4, and IPv6 assumptions without leaving a process behind.
- Janvas working-directory and nested-manifest inference worked without manual path configuration.
- Live exploration completed for every final run.
- Every generated test produced visual evidence, including failed tests.
- Runtime overlays are now treated as failures even when the underlying application shell remains queryable.
- Deterministic fallbacks prevented several structurally unsafe or unsupported model drafts from being saved.
- MDN demonstrated that accessible and semantically rich markup substantially improves useful generation.

### 12.2 What did not work reliably

- The accepted local-model bodies passed only one of four times in this sample.
- Locator validation checks observed names but does not yet validate all locator relationships.
- Presence in source or DOM can be mistaken for visibility in the current application state.
- Exploration state may differ from execution state, as observed in Janvas onboarding.
- The archetype classifier confused registration with authentication.
- Non-semantic visual controls, such as movie seats implemented as `div`s, were not converted into meaningful actions.
- A passed smoke test can still have weak behavioral coverage.

### 12.3 Recommended next implementation work

1. Record element visibility and state preconditions in live evidence, then validate model assertions against them.
2. Reject or normalize chained semantic locator calls that do not represent valid DOM relationships.
3. Preserve browser storage state between exploration and execution when explicitly requested, or generate criteria that model alternative initial states.
4. Add registration and validation archetypes distinct from authentication.
5. Extend live evidence with accessibility-tree snapshots and safe candidate actions for non-button interactive elements.
6. Add a coverage measure that distinguishes render-only smoke tests from state-changing journeys.
7. Run the same candidates with a stronger coding model and with heuristics-only to separate model quality from pipeline quality.

## 13. Candidate Ranking by Research Value

| Rank | Candidate | Why |
| ---: | --- | --- |
| 1 | TodoMVC React | Has a published behavioral specification, state-dependent controls, routes, and equivalent implementations in other frameworks. |
| 2 | Janvas | Represents the actual domain, exercises monorepo/runtime inference, and exposes realistic state and credential constraints. |
| 3 | Dopa | Exercises Vinext runtime discovery, loopback compatibility, repeated commerce controls, and exact accessible names. |
| 4 | MDN To-do Notifications | Provides the cleanest positive control with rich semantic markup and meaningful form interactions. |
| 5 | Form Validator | Concentrates negative oracles and exposes locator-composition and archetype-classification weaknesses. |
| 6 | Movie Seat Booking | Reveals the gap between visual interactivity and accessible/actionable DOM evidence. |
| 7 | Fake Store | Provides the first unknown third-party blind multimodal run and measures false-positive rejection in a rich commerce UI. |

All seven should remain in the evaluation set. Removing failing or zero-finding candidates would make the prototype look more successful while reducing the suite's ability to guide engineering decisions.

## 14. Reproduction Paths

The locally cloned validation targets are:

```text
C:\Users\henri\Documents\GitHub\canvas-wrapper-test
C:\Users\henri\Documents\action-e2e-validation-targets\mdn-to-do-notifications\to-do-notifications
C:\Users\henri\Documents\action-e2e-validation-targets\todomvc\examples\react
C:\Users\henri\Documents\action-e2e-validation-targets\vanillawebprojects\form-validator
C:\Users\henri\Documents\action-e2e-validation-targets\vanillawebprojects\movie-seat-booking
C:\Users\henri\Documents\dopa
C:\Users\henri\Documents\e2p-targets\fakestore-app
```

TodoMVC was cloned with sparse checkout for `examples/react`. Vanilla Web Projects was cloned with sparse checkout for `form-validator` and `movie-seat-booking`. This keeps the local validation corpus small while preserving each selected project's original source.
