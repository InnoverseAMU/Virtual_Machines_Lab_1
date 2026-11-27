# Queue rules (apply to every experiment prompt)

You are working unattended. Nobody will answer questions. Make the most conservative decision, record it, and continue.

## Setup and branches
- Read /docs/ARCHITECTURE.md, /docs/EX3_1_SPEC.md and this file first. Where an experiment prompt and the 3.1 spec disagree, the prompt wins for that experiment.
- Work on a branch named exp-<id> (for example exp-3-2) created from the branch develop (create develop from the current main if it does not exist). Never commit to main.
- Precondition check: each prompt lists what it needs. If it is missing on develop, write docs/review/STOP-<id>.md saying what is missing, and stop.
- Commit in small steps. At the end, merge into develop (no fast-forward) only if all gates pass. Otherwise leave the branch unmerged and say so in the review file.

## Gates (all must pass before merging)
1. npm run build passes; npx vitest run passes with no skipped or weakened tests; the src/core import check passes.
2. Exp 3.1 behaviour is unchanged (its tests and golden values still pass).
3. Tier 1 and Tier 2 of the prompt are complete. Tier 3 may be incomplete only if you say so in the review file.
4. No new runtime dependency without recording it in the review file with a reason.

## Tiers
- Tier 1: components, netlists, fault patterns, physics model, validation and unit tests, self mode wiring flow.
- Tier 2: Observe mode, observation tables, run phase with answers, charts, fairness tests.
- Tier 3: Learn mode steps, connection purposes, polish, layout checks at 1280 and 390 px.
If time or context is running out, finish the tier you are in cleanly, then stop and write the status.

## Engineering rules
- Pure core: nothing in src/core imports React, three, @react-three/* or zustand. Experiments are data; no experiment-specific logic in UI components.
- Never weaken or delete a test to make it pass. If a test fails, find the cause. If the expectation was wrong, explain it in the review file.
- Hand-calculated numbers in a prompt are approximate. Recompute them in code. If a computed value differs from the prompt by more than 3 percent, investigate, trust the code if the code is right, and record the difference.
- Parameters (ratings, impedances, losses) live in one params object per experiment. They are placeholders until the user replaces them with the lab's nameplate data. Do not scatter constants.
- Terminal ids are componentId.terminalName and must match between data and 3D components. Add a test that every terminal id used in an experiment exists.
- Reuse existing components and patterns before creating new ones. New 3D components are tidy primitives with readable labels, terminals at least 0.35 units from neighbours, and a clear layout per stage. Add camera presets per stage and check the focus areas at 1280 and 390 px.
- Meters: class 0.5 relative gain error per session (seeded), pegging at 105 percent, damage above 150 percent, the 20 percent rating rule for instrument ranges, wattmeter multiplying factor MF = voltage range x current range x rated power factor / divisions.
- Wattmeter faults, ammeter-across-source and live-neutral shorts reuse the shared fault pattern factories from the platform prompt.
- Learn text is paraphrased from the experiment's PDF in public/experiments/<folder>/ (never copied at length), 1 to 3 sentences per step.

## Answer checking rules
- The student does the calculations. The app may show per-row convenience values and charts but never the final answers.
- Truth values come from the model. Where the manual's method is approximate (for example lumped losses), truth is the manual's formula applied to noise-free model outputs (method truth), not the raw model parameter.
- Every answer has a tolerance that is fair under worst-case meter gains. Implement a referenceRun(experiment, seed, gains) test helper that wires the correct netlist, follows the manual's procedure, records rows, performs the manual's calculations, and checks all answers. Run it with five seeded gain sets and the extreme combinations (plus and minus 0.5 percent on every meter, and mixed). A failure means the tolerance or the model is unfair.
- Feedback names what failed and why, never the true value.

## Review file (docs/review/<id>.md)
Write it at the end: what was built per tier; every assumption and decision; parameters chosen; each netlist or figure reading to verify against the manual; numbers that differed from the prompt; test summary; known gaps; how to check each item by hand.