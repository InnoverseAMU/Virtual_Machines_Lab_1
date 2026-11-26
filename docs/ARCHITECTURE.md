# Virtual Machines Lab: Architecture v0.2

Course: EEC2910 (Electrical Machines Lab 1). Purpose of this doc: the single source of truth for how the app is structured, written so a human or an AI coding agent can follow it.

## 1. Scope

A web app where students rehearse the lab experiments in 3D across three modes:

- **Learn mode:** guided walkthrough of the full setup (spanning one or more stages), with popups explaining why each component and connection exists and interactive voltage/load checkpoints.
- **Observe mode:** pre-wired bench with stage tabs, net highlighting, and live observation capture for practicing measurements and report calculations.
- **Self mode:** empty bench per stage. The student wires the circuit and submits. Passing a stage unlocks the next stage (applying `carryOver`), and completing all stages + report answers records completion.

## 2. Design principles

1. **Experiments are data; the engine is code.** Adding Exp 3.2–4.5 means writing an experiment definition file (and registering any new physics model or reusable 3D primitive), with no experiment-specific UI code.
2. **Pure core, thin shell.** Circuit validation, fault factories, stages, layout checks, physics models, and answer checking live under `src/core` with zero React, three.js, or Zustand imports.
3. **Validate by nets, not by wires.** Union-find over component internal links (static or control-dependent) plus student wires makes wire order and draw direction irrelevant.
4. **Wrong wiring has consequences.** Faults and open paths feed directly into the physics model so meters peg, reverse, read zero, or trip the MCB.
5. **Readings come from the manual's formulas,** with seeded class 0.5 meter gain errors, clipping at 105%, damage above 150%, and wattmeter multiplying factor `MF = V_range × I_range × PF / divisions`.
6. **Primitives first.** Procedural meshes with `CanvasTexture` labels and dials.

## 3. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite + React + TypeScript | Fast, standard, good agent support |
| 3D | three.js via @react-three/fiber + @react-three/drei | Declarative scenes, built-in controls, picking |
| State | Zustand | Small, works well with R3F |
| Schema validation | Zod | Checks experiment definitions at load time |
| UI | Tailwind CSS | Responsive sidebars, bottom sheet, modals |
| Tests | Vitest | Fast unit tests for core, stores, and layout |
| Animation | GSAP | Smooth camera transitions and theme color tweens |

Progress (`attempts`, `completedStages`, `completedExperiments`, `usedSolutionByExperiment`, `learnCompleted`, `runCompleted`, `runPractised`) is stored in `localStorage` under `vml_progress_v1` (with automatic v1 → v2 migration).

## 4. Layers

```
+--------------------------------------------------+
|  UI layer (React): menus, stepper, panels, SVG   |
+--------------------------------------------------+
|  3D layer (R3F): bench, apparatus, wires, camera |
+--------------------------------------------------+
|  Stores (Zustand): session, wiring, controls     |
+--------------------------------------------------+
|  Core (pure TS, no React / three.js / zustand)   |
|   - circuit: nets, stages, layout, faults, learn |
|   - physics: meters, registry, models, report    |
|   - experiments: data definitions + Zod schema   |
+--------------------------------------------------+
```

**Dependency rule:** arrows point downward only. Nothing in `src/core` imports React, three.js, `@react-three/*`, or Zustand (enforced by `core-purity.test.mjs`).

## 5. Folder structure

```
src/
  core/
    circuit/
      nets.ts           # UnionFind, buildNets, crossProduct, wiresFromNetlist
      validate.ts       # validateWiring(exp, wires, stageIndex, controls)
      feedback.ts       # buildFeedback(exp, result, hintLevel, stageIndex)
      faults.ts         # matchFaultPatterns + legacy deriveConnectionState alias
      faultFactories.ts # wattmeterFaults, ammeterAcrossSource, voltmeterInSeries, liveNeutralShort
      stages.ts         # getStage, getStageComponents, getStageCameraPresets, applyStageCarryOver
      layout.ts         # checkStageLayoutSpacing (min 0.35), layoutBenchRow
      learn.ts          # evaluateLearnStepCondition, findVariacForTargetV1
    physics/
      meters.ts         # Seeded RNG/hidden state, drawSessionMeterGains, evaluateAnalogMeter, evaluateWattmeter
      registry.ts       # PhysicsModel registry (registerPhysicsModel, getPhysicsModel)
      evaluate.ts       # evaluateExperimentPhysics, findMeterReading, toControlValues
      report.ts         # captureStageObservationRow, evaluateRowRules, evaluateStagePrerequisites, checkRunAnswers
      models/
        transformerLoad.ts
    experiments/
      schema.ts         # Zod schemas for ExperimentDef & StageDef
      registry.ts       # EXPERIMENTS, EXPERIMENT_SUMMARIES, netlistToWirePairs
      ex3_1.ts          # Exp 3.1 definition (wrapped as single stage)
    components.ts       # COMPONENT_DEFS + resolveComponentInternalLinks
    types.ts
  components3d/         # AcSupply, Variac, Wattmeter, AnalogMeter, Transformer, LampBank, Wire, Terminal
  scenes/               # BenchScene.tsx (renders active stage components + stage camera presets)
  stores/               # sessionStore.ts, wiringStore.ts, controlsStore.ts, modeActions.ts
  ui/                   # App, ExperimentPicker, ModeSelect, RightSidebar, ObservationsPanel, ObservationChart, ResultModal, LearnPlayer
  tests/
    helpers/referenceRun.ts
```

## 6. Core data model: Experiments & Stages

An `ExperimentDef` declares shared `components[]`, report `answers[]`, fallback `hints[]`/`solutionNote`, and an ordered `stages[]` array:

```ts
interface StageDef {
  id: string;
  title: string;
  summary: string;
  componentIds: string[];
  componentPositions?: Record<string, [number, number, number]>;
  cameraPresets?: CameraPresetDef[];
  acceptedNetlists: Net[][];       // built via crossProduct(variantSets) when independent options exist
  netLabels?: string[];
  netCategories?: string[];
  netCategoryKeys?: NetCategoryKey[];
  netPurposes?: Partial<Record<NetCategoryKey, string>>;
  faultPatterns: FaultPattern[];   // built via faultFactories
  controls: ControlDef[];
  physicsModel: string;            // key in src/core/physics/registry.ts
  physicsParams: Record<string, number>;
  observationTable: ColumnDef[];   // sno | meter | control | derived | hidden
  rowRules: RowRule[];
  prerequisites: PrerequisiteDef[];
  charts?: ChartSpec[];
  learnSteps: LearnStep[];         // each step carries stageId
  hints?: string[];
  solutionNote?: string;
  carryOver?: 'none' | 'consistent-wires';
}
```

- **One-stage experiments** (like Exp 3.1) omit the top-bar stage stepper and behave identically to v0.1.
- **Multi-stage experiments** render a stage stepper in the top bar:
  - **Self mode:** Submit validates the active stage; passing offers *Continue to Stage N*, which resets controls, keeps per-stage observation tables, and carries over wires whose terminals exist in the next stage and belong to its accepted netlists when `carryOver === 'consistent-wires'`. `completedExperiments` requires all stages wired.
  - **Observe mode:** stage tabs switch between pre-wired stages.
  - **Learn mode:** `LearnStep.stageId` automatically switches the active stage on Next/Back/Skip.

## 7. Physics model registry & Generic instruments

Every physics model implements `PhysicsModel`:

- `deriveConnectionState(nets, controls, stageParams, faults?, seed?)` → returns connection state with `shorted`, `shortFaults`, `matchedFaultIds`, `energised`, `loadConnected`.
- `solve(input)` → returns generic `PhysicsSolveOutput`:
  - `meters: MeterReading[]` (`id`, `label`, `kind`, `unit`, `range`, `trueValue`, `shownValue`, `pointerRatio`, `overrange`, `damaged`, `reversed`, plus wattmeter `dial`, `mf`, `vRange`, `iRange`, `divisions`, `pf`)
  - `events: RuntimeEvent[]`
  - `mcbTripped: boolean`, `runFailed: boolean`
  - `outputs: Record<string, number>`

Generic instruments (`AnalogMeter`, `Wattmeter`, `Variac`) read component `params` (`ranges`, `divisions`, `pf` 1.0 or 0.2, `reverseSwitch`, `fineStep: 0.1`) and generic `controlsStore.values`. `ComponentTypeDef.internalLinks` accepts either static pairs or `(controls, instance) => [string, string][]` for selector plugs.

## 8. Seeded hidden state

`sessionStore.sessionSeed` holds the active session seed:
- **Observe mode** and deterministic tests use `OBSERVE_FIXED_SEED` (`202601`).
- **Self / Learn modes** draw a fresh session seed on entry.
- `drawSessionMeterGains(seed, meterIds)` draws class 0.5 gains (`±0.5%`).
- `deriveHiddenPolarity(seed, key)` and `deriveHiddenTerminalScramble(seed, key, terminals)` provide deterministic hidden properties to `PhysicsModel` implementations.

## 9. Schema-driven observations, charts, and answer checking

- **Observation table (`ColumnDef[]`):** `+ Add row` captures `sno`, `meter` (`shownValue`, `dial`, `mf`, `trueValue`), `control`, and `hidden` columns into per-stage read-only rows; `derived` columns compute pure functions of the row (`eff`, `loadVA`).
- **`rowRules`:** per-row predicates with `amber` highlighting and toast/tooltip messages.
- **`prerequisites`:** declared predicates over stage rows rendered as a live checklist.
- **`ChartSpec` & `ObservationChart`:** plain multi-series theme-aware SVG chart plotting any numeric/derived columns with optional reference lines, readable at 390 px and 1280 px.
- **`AnswerSpec` & `checkRunAnswers`:** evaluates stage prerequisites, `rowRules`, and `ExperimentDef.answers[]` (`kind: 'number' | 'choice'`, `abs`/`rel` tolerances) returning structured failures (`failedPrerequisites`, `failedRowRules`, `failedAnswers`, `hints`) without ever leaking true values.

## 10. Layout & Testing

- `checkStageLayoutSpacing(components, 0.35)` verifies no two components or inter-component terminals in any stage are closer than `0.35` world units.
- Every stage declares `cameraPresets[]` and `LearnStep.camera` values must reference declared presets.
- `referenceRun(experiment, seed, gains)` wires canonical netlists, executes the manual's procedure, records rows, computes answers from noisy readings, and verifies fairness across 5+ seeded gain sets and extreme `±0.5%` combinations.
