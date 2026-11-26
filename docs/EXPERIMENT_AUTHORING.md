# Experiment Authoring Checklist

Use this checklist whenever adding a new experiment (e.g., Exp 3.2 through 4.5) on top of the generalised platform.

## 1. Branch & Preconditions
- Branch from `develop`: `git checkout -b exp-<id> develop`.
- Read the experiment section in `docs/EEC2910 - Lab Manual.pdf` (or `public/experiments/<folder>/`) and verify asset paths in `src/generated/assets.json`.
- If a required 3D apparatus type or physics model does not exist yet, check if an existing primitive/model can be parameterised first before adding a new component type.

## 2. Data Definition (`src/core/experiments/exX_Y.ts`)
- [ ] **Components (`components[]`)**: declare all apparatus with unique `id`, `type`, `label`, default `position`, and nameplate `params` (ratings, ranges, divisions, `pf: 1.0 | 0.2`, etc.) grouped cleanly in one params object.
- [ ] **Stages (`stages[]`)**: for each stage (`id`, `title`, `summary`):
  - [ ] `componentIds` and optional `componentPositions` (use `layoutBenchRow` or verify `>= 0.35` unit spacing).
  - [ ] `cameraPresets[]` including `'overview'` and focus areas suitable for both 1280 px and 390 px viewports.
  - [ ] `acceptedNetlists`: build variants with `crossProduct(variantSets)` (canonical netlist first).
  - [ ] `netLabels`, `netCategories`, `netCategoryKeys`, `netPurposes` aligned 1-to-1 with canonical net indices.
  - [ ] `faultPatterns`: reuse `wattmeterFaults`, `ammeterAcrossSource`, `voltmeterInSeries`, and `liveNeutralShort` from `src/core/circuit/faultFactories.ts`, plus any stage-specific faults.
  - [ ] `controls`: switches, variac knobs (`step: 1` or `0.1`, `fineStep: 0.1`), range/plug selectors, load steps.
  - [ ] `physicsModel` key and `physicsParams` (no scattered magic numbers).
  - [ ] `observationTable` (`ColumnDef[]` with `sno`, `meter`, `control`, `derived`, and `hidden` columns).
  - [ ] `rowRules` (per-row checks such as holding rated voltage/current, with `amber: true` and `minPassCount` if enforced).
  - [ ] `prerequisites` (row count and operating-point checklist items).
  - [ ] `charts` (`ChartSpec[]` referencing column IDs from `observationTable`).
  - [ ] `learnSteps` (each with `stageId`, declared `camera`, `focus`, `connectTerminals`, optional `completionCondition`, and 1–3 paraphrased sentences).
  - [ ] Optional `carryOver: 'none' | 'consistent-wires'` for stage 2+.
- [ ] **Answers (`answers[]`)**: declare `AnswerSpec[]` (`kind: 'number' | 'choice'`, `truth(rows, model, params, rowsByStage)`, `tolerance: { abs } | { rel }`, non-leaking `failHint`).
- [ ] **Registry (`src/core/experiments/registry.ts`)**: add the experiment to `RAW_EXPERIMENTS` and mark `available: true` in `EXPERIMENT_SUMMARIES`.

## 3. Physics & Components (only if new apparatus/model is needed)
- [ ] **Physics model (`src/core/physics/models/<name>.ts`)**: implement `PhysicsModel` (`deriveConnectionState` + `solve` returning `MeterReading[]`, `events`, `mcbTripped`, `runFailed`, `outputs`) and register it in `src/core/physics/registry.ts`. Use `seed` via `deriveHiddenPolarity` / `deriveHiddenTerminalScramble` for any hidden apparatus variation.
- [ ] **Components (`src/core/components.ts` & `src/components3d/`)**: match terminal names `componentId.terminalName` exactly between `COMPONENT_DEFS` and `exX_Y.ts`. Keep `src/core` completely free of React, three.js, and Zustand imports.

## 4. Tests to Add
- [ ] **Schema & terminal integrity** (`src/tests/schema.test.ts` automatically validates every experiment in `EXPERIMENTS`).
- [ ] **Layout & cameras** (`src/tests/layout.test.ts` automatically checks spacing `>= 0.35` and declared camera presets for every stage in `EXPERIMENTS`).
- [ ] **Validation & faults**: test every accepted netlist variant, wire-order invariance, open nets, shorts, and every fault pattern.
- [ ] **Physics**: test manual reference points, overrange/damage thresholds, MCB trip on short, and meter `dial * MF`.
- [ ] **Fairness (`referenceRun`)**: register the manual's procedure in `src/tests/helpers/referenceRun.ts` and assert `referenceRun(exp, seed, gains).passed === true` across 5+ seeded gain sets and extreme `±0.5%` gain combinations (`+all`, `-all`, mixed).
- [ ] **Multi-stage / Learn / Observe**: verify learn-step wires match canonical netlists per stage, stage `carryOver`, and Observe stage tabs.

## 5. Tiers & Merge Gates
- **Tier 1**: components, netlists, fault patterns, physics model, validation & physics unit tests, Self mode wiring flow.
- **Tier 2**: Observe mode, observation tables, run phase with answers, charts, `referenceRun` fairness tests.
- **Tier 3**: Learn mode steps, connection purposes, layout & responsive checks at 1280 px and 390 px, review doc `docs/review/<id>.md`.
- **Merge gates**: `npm run build` passes, `npx vitest run` passes with zero skipped tests, `core-purity.test.mjs` passes, and Exp 3.1 golden tests (`ex3_1_golden.test.ts`) pass unchanged.
