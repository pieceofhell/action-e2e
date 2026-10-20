# Frozen compiler input

Guest-mode journey recorded by E2P on the public Music Player example, original run `music-player-2026-09-05T14-54-16-295Z`. These JSON files and the historical generated test are frozen inputs for compiler regression, not new exploratory results. Absolute paths in the original metadata identify provenance; the fixture does not read those paths.

Keeping the inputs here ensures the regression executes in a fresh checkout instead of silently passing when a private run directory is missing. The target application itself is obtained separately with `node scripts/setup-evaluation-targets.cjs`.
