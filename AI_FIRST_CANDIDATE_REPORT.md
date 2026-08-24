# AI-first Candidate Evaluation

Generated: 2026-08-16T01:54:07.533Z

All runs use guest access, model-guided exploration, model-authored evidence-grounded planning, validated Playwright generation, and fail-fast stage semantics. The model and protocol used by each latest stored run are shown explicitly. Version `ai-first-adaptive-v2` includes authoritative action-ID normalization and adaptive budgets; version `ai-first-fail-fast-v1` rows are retained as historical comparison and may show action-kind failures fixed in v2. No heuristic flow or test fallback is permitted.

| Candidate | Protocol | Model | Status | Stopped at | Actions | States | Budget | Exploration end | AI flows | Tests | Passed |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Janvas | ai-first-adaptive-v2 | qwen3:8b | completed | - | 6 | 4 | 12/20 | safe-actions-exhausted | 1 | 1 | 1/1 |
| Dopa | ai-first-fail-fast-v1 | qwen3:8b | stopped | model-guided live exploration | 1 | 1 | -/20 | invalid-model-decision | 0 | 0 | 0/0 |
| MDN To-do Notifications | ai-first-fail-fast-v1 | qwen3:8b | stopped | model-guided live exploration | 6 | 2 | -/20 | invalid-model-decision | 0 | 0 | 0/0 |
| TodoMVC React | ai-first-adaptive-v2 | qwen3:8b | completed | - | 5 | 4 | 11/20 | safe-actions-exhausted | 3 | 3 | 3/3 |
| Form Validator | ai-first-fail-fast-v1 | qwen3:8b | stopped | model-guided live exploration | 2 | 2 | -/20 | invalid-model-decision | 0 | 0 | 0/0 |
| Movie Seat Booking | ai-first-fail-fast-v1 | qwen3:8b | stopped | model-guided live exploration | 9 | 9 | -/20 | invalid-model-decision | 0 | 0 | 0/0 |

## Janvas

- Model: qwen3:8b.
- Status: **completed**.
- Exploration end: safe-actions-exhausted; adaptive budget 12 of hard ceiling 20.
- Model actions: Start with Janvas; Canvas URL; Show; Press Enter in Canvas URL; Hide; Privacy policy.
- Generated tests: Navigation to Privacy Policy Page (model-journey-compiled).
- Execution: Navigation to Privacy Policy Page: passed.

## Dopa

- Model: qwen3:8b.
- Status: **stopped** at **model-guided live exploration**.
- Exploration end: invalid-model-decision; adaptive budget n/a of hard ceiling 20.
- Model actions: ⌘ Tecnologia.
- Generated tests: none.
- Execution: not reached.
- Stop reason: Model-guided exploration failed at decision 2: The model requested click for a control that only supports fill.

## MDN To-do Notifications

- Model: qwen3:8b.
- Status: **stopped** at **model-guided live exploration**.
- Exploration end: invalid-model-decision; adaptive budget n/a of hard ceiling 20.
- Model actions: 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31; January February March April May June July August September October November December; 2026 2027 2028 2029 2030 2031 2032 2033 2034 2035 2036 2037 2038; Interactive input 0; Complete the task; Enable notifications.
- Generated tests: none.
- Execution: not reached.
- Stop reason: Model-guided exploration failed at decision 7: The model selected an action that was not present in the current safe action set.

## TodoMVC React

- Model: qwen3:8b.
- Status: **completed**.
- Exploration end: safe-actions-exhausted; adaptive budget 11 of hard ceiling 20.
- Model actions: New Todo Input; Press Enter in New Todo Input; Completed; Active; All.
- Generated tests: Create a new todo item (model-journey-compiled); Filter todos to show only completed items (model-journey-compiled); Mark a todo item as complete (model-journey-compiled).
- Execution: Create a new todo item: passed; Filter todos to show only completed items: passed; Mark a todo item as complete: passed.

## Form Validator

- Model: qwen3:8b.
- Status: **stopped** at **model-guided live exploration**.
- Exploration end: invalid-model-decision; adaptive budget n/a of hard ceiling 20.
- Model actions: Enter username; testuser123.
- Generated tests: none.
- Execution: not reached.
- Stop reason: Model-guided exploration failed at decision 3: The model selected an action that was not present in the current safe action set.

## Movie Seat Booking

- Model: qwen3:8b.
- Status: **stopped** at **model-guided live exploration**.
- Exploration end: invalid-model-decision; adaptive budget n/a of hard ceiling 20.
- Model actions: Avengers: Endgame ($10) Joker ($12) Toy Story 4 ($8) The Lion King ($9); Interactive seat 3; Interactive seat 4; Interactive seat 5; Interactive seat 6; Interactive seat 7; Interactive seat 8; Interactive seat 9; Interactive seat 10.
- Generated tests: none.
- Execution: not reached.
- Stop reason: Model-guided exploration failed at decision 10: The model requested select for a control that only supports click.

