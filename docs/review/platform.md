# Platform Generalisation Review (`docs/review/platform.md`)

Branch: `platform-generalisation` (branched from `develop` at `master` `a58791a`).

## Confirmation: Golden Tests Unchanged
- `src/tests/ex3_1_golden.test.ts` was committed first in `2a84acc` ("Add Exp 3.1 golden tests before platform generalisation") before any refactoring.
- `git diff 2a84acc -- src/tests/ex3_1_golden.test.ts` produces **zero diff** (file is completely unchanged) and all 6 golden test suites pass against the refactored platform.

## Summary by Tier

### Tier 1 (Items 1–4, 8, 9, 10)
1. **Golden tests first (`src/tests/ex3_1_golden.test.ts`)**: Freezes Exp 3.1 Spec Section 6 reference values, Netlist A & B + all 8 fault outcomes, report truth & fairness across seeded/extreme gains, learn-step wire equality, and Observe-mode pre-wired bench.
2. **Stages (`src/core/circuit/stages.ts`, `src/core/types.ts`, `src/core/experiments/schema.ts`)**: Added `StageDef` (`id`, `title`, `summary`, `componentIds`, `componentPositions`, `cameraPresets`, `acceptedNetlists`, `faultPatterns`, `controls`, `physicsModel`, `physicsParams`, `observationTable`, `rowRules`, `prerequisites`, `charts`, `learnSteps`, `netCategories`, `netPurposes`, `carryOver: 'none' | 'consistent-wires'`). Wrapped Exp 3.1 as a single stage (`load-test`). Added top-bar stage stepper in `App.tsx`, multi-stage Continue flow in `ResultModal.tsx` & `sessionStore.ts`, Observe-mode stage tabs, automatic stage switching in Learn mode, `completedStages` progress tracking, and v1 → v2 progress migration.
3. **Physics model registry (`src/core/physics/registry.ts`, `src/core/physics/models/transformerLoad.ts`, `src/core/physics/evaluate.ts`)**: Added `PhysicsModel` interface (`deriveConnectionState` + `solve` returning `MeterReading[]`, `events`, `mcbTripped`, `runFailed`, `outputs`). Moved `transformerLoad` behind the registry. Updated `RightSidebar`, `ComponentRenderer`, `AnalogMeter`, `Wattmeter`, `LampBank`, `ObservationsPanel`, and `App` to consume generic `PhysicsSolveOutput`.
4. **Generic instruments (`src/core/physics/meters.ts`, `src/core/components.ts`, `src/stores/controlsStore.ts`, `src/components3d/`)**: Parameterised voltmeter/ammeter/wattmeter (`ranges`, `divisions`, `pf` 1.0 or 0.2, `reverseSwitch` flipping shown sign and recording signed values, PC/CC range selectors), variac `0.1 V` fine adjustment (`fineStep: 0.1`, `Alt+Arrow` + sidebar fine step buttons without integer truncation), and `ComponentTypeDef.internalLinks` supporting `(controls, instance) => [string, string][]`.
8. **Fault pattern factories (`src/core/circuit/faultFactories.ts`)**: Added pure factories `wattmeterFaults`, `ammeterAcrossSource`, `voltmeterInSeries`, and `liveNeutralShort`; ported all Exp 3.1 faults with identical descriptions and effects.
9. **Netlist variants helper (`src/core/circuit/nets.ts`)**: Added `crossProduct(variantSets)` with overlapping-net merging and ported Exp 3.1 `[NET_A, NET_B]`.
10. **Seeded hidden state (`src/core/physics/meters.ts`, `src/stores/sessionStore.ts`, `src/stores/modeActions.ts`)**: Moved `sessionSeed` to `sessionStore` (`OBSERVE_FIXED_SEED = 202601` for Observe mode), passed `seed` into `evaluateExperimentPhysics` and `PhysicsModel`, and added `deriveHiddenPolarity` and `deriveHiddenTerminalScramble`.

### Tier 2 (Items 5–7)
5. **Schema-driven observation tables (`src/core/physics/report.ts`, `src/ui/ObservationsPanel.tsx`)**: Added `ColumnDef` (`sno`, `meter`, `control`, `derived`, `hidden`, `decimals`), `RowRule` (amber highlight + message + enforcement), `PrerequisiteDef`, and per-stage `observationRowsByStage`. Rewrote `ObservationsPanel` to render any table from data; Exp 3.1 efficiency (`eff`) and `loadVA` are now derived columns.
6. **Answer framework (`src/core/physics/report.ts`, `src/tests/helpers/referenceRun.ts`)**: Added `AnswerSpec` (`kind: 'number' | 'choice'`, `truth`, `tolerance: { abs } | { rel }`, `failHint`), `ExperimentDef.answers[]`, and generic `checkRunAnswers` / `evaluateExperimentAnswers` returning structured failures without leaking true values. Ported Exp 3.1 with identical thresholds (`±0.4 pp` regulation, `±15 pp` max efficiency load) and ported fairness tests in `src/tests/report.test.ts` to `referenceRun`.
7. **Chart framework (`src/ui/ObservationChart.tsx`)**: Added `ChartSpec` and generic multi-series, theme-aware plain SVG chart with reference lines and responsive scaling at 390 px. Removed hardcoded `EfficiencyChart.tsx` and ported Exp 3.1's efficiency curve to `ChartSpec`.

### Tier 3 (Items 11–12)
11. **Layout helper & camera presets (`src/core/circuit/layout.ts`, `src/scenes/BenchScene.tsx`)**: Added `checkStageLayoutSpacing(..., 0.35)` and `layoutBenchRow`, per-stage `componentPositions`, and per-stage `cameraPresets` declared in data (`StageDef.cameraPresets`). Verified by `src/tests/layout.test.ts`.
12. **Docs**: Updated `docs/ARCHITECTURE.md` (v0.2) and created `docs/EXPERIMENT_AUTHORING.md`.

## Migration Table (Old → New Names)

| Old name / location | New name / location | Notes |
| --- | --- | --- |
| `ExperimentDef.acceptedNetlists`, `faultPatterns`, `controls`, `physicsModel`, `physicsParams`, `observationTable`, `learnSteps`, `netLabels`, `netCategories`, `netCategoryKeys`, `netPurposes` | `StageDef` fields inside `ExperimentDef.stages[]` | Use `getStage(exp, stageIndex)` and `getStageComponents(exp, stage)` in `src/core/circuit/stages.ts`. `ex3_1` retains getters for `learnSteps` & `faultPatterns` for frozen golden test compatibility. |
| `ColumnDef { key, label, unit }` | `ColumnDef { id, label, shortLabel?, unit?, source, decimals?, displayDecimals?, hidden?, placeholder? }` | `source` is `sno` \| `meter` \| `control` \| `derived` \| `hidden`. |
| `ObservationRow { id, sno, v1, i2, v2, dial, mf, p1, lamps, v1OutOfRange }` | `ObservationRow { id, sno, values: Record<string, ObservationCellValue> }` | Read cells with `getRowValue(row, id)` / `getRowNumber(row, id)` in `src/core/physics/report.ts`. |
| `TransformerLoadOutput` (`meters: { vp, vs, am, wm }`, top-level `V1, I2...`) | `PhysicsSolveOutput` (`meters: MeterReading[]`, `outputs: Record<string, number>`) | Use `findMeterReading(output, id)` in `src/core/physics/evaluate.ts`. Legacy `solveTransformerLoad` remains exported for direct solver tests. |
| `deriveConnectionState(graph, faults, supplyOn)` in `src/core/circuit/faults.ts` | `PhysicsModel.deriveConnectionState(nets, controls, stageParams, faults?, seed?)` via `getPhysicsModel(id)` | Legacy `deriveConnectionState` in `faults.ts` delegates to `deriveTransformerLoadConnectionState`. |
| `TransformerLoadControls` (`supplyOn`, `variacV`, ...) | `ControlValues` (`Record<string, boolean \| number \| string>`) keyed by `ControlDef.id` | `controlsStore.values` is primary; legacy properties remain synced. `toControlValues()` normalizes both. |
| `EfficiencyChart.tsx` | `ObservationChart.tsx` driven by `ChartSpec` | Supports multi-series SVG curves, reference lines, and theme tokens. |
| `checkRunAnswers(rows, answers, truth)` + `evaluateRunPrerequisites(rows)` | `checkRunAnswers(experiment, rowsByStage, answers)` + `evaluateStagePrerequisites(stage, rows)` + `evaluateRowRules(stage, row)` | Legacy 3-arg overload of `checkRunAnswers` retained for frozen golden tests. |
| `captureObservationRow(output, controls, sno, id)` | `captureStageObservationRow(stage, output, controls, sno, id)` (and `captureObservationRow` overload) | Captures declared columns and evaluates derived columns. |
| `CAMERA_PRESETS` hardcoded in `BenchScene.tsx` / `App.tsx` | `StageDef.cameraPresets` + `DEFAULT_CAMERA_PRESETS` in `stages.ts` | Resolved dynamically per stage via `getStageCameraPresets(stage)`. |
| Hand-written 3.1 faults in `ex3_1.ts` | `wattmeterFaults`, `ammeterAcrossSource`, `voltmeterInSeries`, `liveNeutralShort` in `faultFactories.ts` | Pure core factories preserving exact descriptions and effects. |
| Hardcoded `[NET_A, NET_B]` | `crossProduct(variantSets)` in `src/core/circuit/nets.ts` | Cartesian product of independent net alternatives with shared-terminal merging. |
| `StoredProgress` (v1, no `completedStages`) | `StoredProgress` (v2, includes `completedStages: Record<string, string[]>`) | `parseStoredProgress` automatically migrates v1 `completedExperiments` into `completedStages`. |

## Decisions & Assumptions
- **Component-to-component spacing vs intra-component terminal spacing**: Existing Exp 3.1 4-terminal enclosures (`variac1ph`, `wattmeter`, `transformer1ph`) place their 4 front terminals 0.22–0.24 units apart on a ~1.0-unit wide box. `checkStageLayoutSpacing(components, 0.35)` checks component-to-component center distance (`>= 0.35`) and all inter-component terminal distances (`>= 0.35`, i.e. terminals on distinct components), preserving Exp 3.1 geometry unchanged while catching crowded bench layouts.
- **No new runtime dependencies**: Everything uses existing stack dependencies (React, Tailwind, Zustand, Zod, Three/R3F, GSAP).
- **One-stage Exp 3.1 UX parity**: When `experiment.stages.length === 1`, the top-bar stage stepper is hidden so Exp 3.1 keeps its exact existing UI layout.

## Test Summary
- `npm run build` (`tsc -b && vite build`): passes.
- `npx vitest run`: **16 test files, 86 tests passing**, 0 skipped, including:
  - `ex3_1_golden.test.ts` (6 tests, unchanged since commit `2a84acc`)
  - `core-purity.test.mjs` (verifies `src/core` has zero React/three/Zustand imports)
  - `stages.test.ts` (5 tests), `instruments.test.ts` (6 tests), `layout.test.ts` (3 tests), `answers-charts.test.ts` (1 test)
  - `report.test.ts` (6 tests ported to `referenceRun` across 6 seeds and all 4 extreme `±0.5%` gain combinations)
  - `schema.test.ts` (3), `validation.test.ts` (16), `physics.test.ts` (11), `learn.test.ts` (6), `observe.test.ts` (5), `feedback.test.ts` (4), `assets.test.ts` (4), `assets-generator.test.mjs` (6), `theme.test.ts` (3).

## How to Verify by Hand
1. Run `npm run dev` and open Exp 3.1 in **Self**, **Learn**, and **Observe** modes at both 1280 px and 390 px:
   - Verify no stage stepper appears (single-stage parity), camera presets work, wires validate Netlist A & B, faults trigger expected meter/MCB behavior, Observations tab renders the schema-driven table (with derived `η%` column), efficiency chart plots correctly, and report check accepts valid runs.
2. Test `0.1 V` fine adjustment on the Autotransformer in the Bench Controls sidebar (`-0.1` / `+0.1` buttons) and 3D knob (`Alt + ArrowUp/Down`).
3. Verify `git diff 2a84acc -- src/tests/ex3_1_golden.test.ts` is empty.
