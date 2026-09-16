# Interface discovery and flow admission — retest

The reported Form Validator run (`form-validator-2026-09-13T13-41-32-014Z`) completed only Username fill with `a` and Enter. Email, password fields and Submit were excluded by policy. The catalog then ran out of allowed unused actions. Exploration was also explicitly encouraged to probe single-character boundaries. Flow admission contained a blanket password keyword exclusion, capable of rejecting a valid observation of password-related error text.

Changes prioritize ordinary fictional input, treat QA goals as context for discovery, disable automatic single-character enforcement in that phase, allow one validation correction/recommit, and expose excluded controls. Password error observations are distinguished from credential entry proposals. The diagnostic collector and subsequent defect author, critic, and replay remain in place.

Two real attempts were run with `qwen3.8-vl-27b-iq1m-64k` using llama.cpp and 65,536 configured context tokens. The first (`form-validator-2026-09-13T19-10-00-335Z`) exposed an additional issue: malformed model JSON escaped the decision repair loop and stopped planning after useful actions. Parsing failures now participate in the same bounded retry. A field-specific validation gate also avoids correcting Username merely because Email has an error.

The second attempt (`form-validator-2026-09-13T19-12-00-882Z`) completed Username=`sampleuser` and Enter without invalid decisions, retained no defect hypotheses, and admitted two model-authored flows:

- Registration Form Validation Journey
- Username Field Fill Observation

Their criteria reference the actual recorded states and validation messages. The previous keyword filter would reject both because they mention password fields. This retest reached exploration and flow planning; the two flows were not compiled and executed as a new Playwright suite in this evaluation.

The full automated suite passes **96 tests**, including correction/recommit bounds, observed error text versus credential entry, malformed JSON recovery, and runtime-overlay failure detection. Dopa was not rerun in this iteration; preservation of its diagnostic path is supported by the existing runtime and defect regression checks, not by a new Dopa benchmark.

The current guest policy still prevents a complete registration-form journey. That limitation is now visible rather than being confused with successful full exploration. Active adversarial exploration is not introduced by this change: defect assessment remains a later analysis and replay of collected evidence. No product-wide bug-detection improvement is claimed from this single-project retest.
