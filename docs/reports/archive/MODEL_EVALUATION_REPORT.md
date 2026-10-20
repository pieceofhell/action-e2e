# Local Model Evaluation on Dopa

Generated: 2026-08-14T16:24:06.788Z

## Purpose

This controlled experiment evaluates how different local models support E2P's complete AI-centered pipeline: project understanding, stateful live exploration, evidence-grounded flow and acceptance-criteria generation, Playwright authoring, and test execution. The deterministic path is treated only as a baseline or explicitly reported fallback.

## Safety and comparability

Every model receives the same Dopa project, guest access, eight-action exploration limit, and four-flow execution limit. The browser blocks non-read network methods and high-risk controls such as checkout, payment, deletion, publishing, and final submission. Client-local interactions such as opening details, search, favorites, and cart state are allowed because they provide useful QA evidence without mutating server data.

## Comparison

| Model | Run outcome | Actions | States | Exercised coverage | AI flows | Free-form / compiled / total | Passing AI-derived | Overall passing |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| llama3.1:8b | completed | 2 | 1 | search-filter, navigation | 3 | 0/0/3 | 0 | 3/3 |
| qwen3:8b | completed | 4 | 4 | product-details, favorites, cart, navigation | 3 | 0/3/3 | 3 | 3/3 |
| qwen2.5-coder:7b | completed-with-test-failures | 2 | 1 | search-filter, navigation | 3 | 2/0/3 | 0 | 1/3 |
| gemma3:12b | failed | 4 | 5 | product-details, search-filter | 0 | 0/0/0 | 0 | 0/0 |

## llama3.1:8b

- **Outcome:** completed
- **Exploration:** 2 completed actions, 1 unique states, exercised coverage in search-filter, navigation. The page exposed opportunities in product-details, search-filter, favorites, cart, navigation.
- **Planning:** 3 approved AI-generated flows.
- **Generation:** 0 free-form model test(s), 0 compiled model-journey test(s), and 3 explicitly reported baseline fallback(s).
- **Execution:** 0 AI-derived test(s) passed; 3/3 tests passed overall.

### Selected flows

- Main interface rendering (2 criteria; evidence: baseline context)
- Primary action review (2 criteria; evidence: baseline context)
- Safe interface exploration (1 criteria; evidence: baseline context)

## qwen3:8b

- **Outcome:** completed
- **Exploration:** 4 completed actions, 4 unique states, exercised coverage in product-details, favorites, cart, navigation. The page exposed opportunities in product-details, search-filter, favorites, cart, navigation.
- **Planning:** 3 approved AI-generated flows.
- **Generation:** 0 free-form model test(s), 3 compiled model-journey test(s), and 0 explicitly reported baseline fallback(s).
- **Execution:** 3 AI-derived test(s) passed; 3/3 tests passed overall.

### Selected flows

- Verify Primary Navigation and User Actions (2 criteria; evidence: state-1, state-2)
- Validate Main Interface Rendering (1 criteria; evidence: state-1, state-3)
- Test Safe Exploration Patterns (2 criteria; evidence: state-2, state-4)

## qwen2.5-coder:7b

- **Outcome:** completed-with-test-failures
- **Exploration:** 2 completed actions, 1 unique states, exercised coverage in search-filter, navigation. The page exposed opportunities in product-details, search-filter, favorites, cart, navigation.
- **Planning:** 3 approved AI-generated flows.
- **Generation:** 2 free-form model test(s), 0 compiled model-journey test(s), and 1 explicitly reported baseline fallback(s).
- **Execution:** 0 AI-derived test(s) passed; 1/3 tests passed overall.

### Selected flows

- Main interface rendering (2 criteria; evidence: baseline context)
- Primary action review (2 criteria; evidence: baseline context)
- Safe interface exploration (1 criteria; evidence: baseline context)

## gemma3:12b

- **Outcome:** failed - The model response was not valid JSON.
- **Exploration:** 4 completed actions, 5 unique states, exercised coverage in product-details, search-filter. The page exposed opportunities in product-details, search-filter, favorites, cart, navigation.
- **Planning:** No admissible AI plan; 3 baseline flows were retained (The model response was not valid JSON.).
- **Generation:** 0 free-form model test(s), 0 compiled model-journey test(s), and 0 explicitly reported baseline fallback(s).
- **Execution:** 0 AI-derived test(s) passed; 0/0 tests passed overall.

### Selected flows

- Main interface rendering (2 criteria; evidence: baseline context)
- Primary action review (2 criteria; evidence: baseline context)
- Safe interface exploration (1 criteria; evidence: baseline context)

## Interpretation limits

This is a repeatable exploratory benchmark on one compact commerce application, not a general model ranking. A passing generated test demonstrates executable evidence for the observed Dopa state; it does not prove complete application correctness. Overall passing counts can include explicit deterministic fallbacks and must not be interpreted as model success. Repeated runs and additional candidate projects are required to estimate stability and transferability.
