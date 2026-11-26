# Virtual Machines Lab: Architecture v0.1

Course: EEC2910 (Electrical Machines Lab 1). Purpose of this doc: the single source of truth for how the app is structured, written so a human or an AI coding agent can follow it.

## 1. Scope

A web app where students rehearse the lab experiments in 3D.

- **Learn mode:** guided walkthrough of the full setup, with popups explaining why each component and connection exists.
- **Self mode:** the student sets the autotransformer, wires the circuit, and submits. The app validates the wiring and either shows success or explains the fault, with retry, hint, or solution.

**MVP:** the engine plus Exp 3.1 only. Every later experiment is mostly data added on top of the engine.

**Non-goals for v1:** SPICE-level general simulation, VR, user accounts or a backend, all nine experiments.

## 2. Design principles

1. **Experiments are data; the engine is code.** Adding Exp 3.2 should mean writing a definition file, not new engine logic.
2. **Pure core, thin shell.** Circuit validation and physics are plain TypeScript with no React or three.js imports, so they can be unit tested.
3. **Validate by nets, not by wires.** Many wirings are electrically identical; wire order and drawing order must not matter.
4. **Wrong wiring has consequences.** A mistake changes what the meters show, as it would on a real bench, instead of only displaying an error.
5. **Readings come from the manual's formulas,** with realistic meter imperfections (range, clipping, small error, quantisation).
6. **Primitives first.** Boxes and cylinders for apparatus until the engine works; swap in GLB models later.

## 3. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite + React + TypeScript | Fast, standard, good agent support |
| 3D | three.js via @react-three/fiber + @react-three/drei | Declarative scenes, built-in controls, picking |
| State | Zustand | Small, works well with R3F |
| Schema validation | Zod | Checks experiment definitions at load time |
| UI | Tailwind CSS | Quick popups, panels, screens |
| Tests | Vitest | For validation and physics logic |
| Hosting | Static (Vercel, Netlify, or GitHub Pages) | No backend needed for v1 |
| Animation | GSAP |  |

Progress (attempts, completed experiments) is stored in localStorage for v1.

## 4. Layers

```
+--------------------------------------------------+
|  UI layer (React): menus, popups, mode screens   |
+--------------------------------------------------+
|  3D layer (R3F): bench, apparatus, wires, camera |
+--------------------------------------------------+
|  Stores (Zustand): session, wiring, controls     |
+--------------------------------------------------+
|  Core (pure TS, no React / three.js)             |
|   - circuit: terminals, nets, validation         |
|   - physics: per-experiment models, meters       |
|   - experiments: data definitions + schema       |
+--------------------------------------------------+
```

**Dependency rule:** arrows point downward only. The core never imports from the layers above it. The 3D layer renders whatever the stores say and reports clicks and drags back into the stores.

## 5. Folder structure

```
src/
  core/
    circuit/        # nets.ts, validate.ts, faults.ts
    physics/        # meters.ts, models/transformerLoad.ts, ...
    experiments/    # ex3_1.ts, ex3_2.ts, schema.ts, registry.ts
    types.ts
  components3d/     # Transformer.tsx, Wattmeter.tsx, Variac.tsx, Wire.tsx ...
  scenes/           # BenchScene.tsx (loads an experiment, places components)
  stores/           # wiringStore.ts, controlsStore.ts, sessionStore.ts
  ui/               # ExperimentPicker, ModeSelect, Popup, ResultScreen, HintPanel
  tests/
```

## 6. Core types

Every terminal has a global id of the form `componentId.terminalName`, for example `wm1.M` or `tx1.P1`.

```ts
type TerminalId = string;           // 'wm1.M'
type Net = TerminalId[];            // terminals that must all be electrically common

interface ComponentInstance {
  id: string;                       // 'wm1'
  type: ComponentType;              // 'wattmeter' | 'transformer1ph' | 'variac1ph' | ...
  label: string;                    // 'Wattmeter'
  position: [number, number, number];
  params: Record<string, number | string>;   // ratings, nameplate data
}

// Every component TYPE is registered once and defines:
interface ComponentTypeDef {
  terminals: { name: string; localPos: [number, number, number] }[];
  controls?: ControlDef[];          // e.g. variac knob, load switches
  Render3D: React.ComponentType<...>;   // lives in components3d/
}
```

## 7. Experiment definition (the key idea)

One file per experiment, validated by Zod at startup.

```ts
interface ExperimentDef {
  id: string;                       // 'ex3.1'
  title: string;
  object: string[];                 // from the manual's OBJECT section
  components: ComponentInstance[];
  requiredNets: Net[];              // the correct wiring
  faultPatterns: FaultPattern[];    // known wrong wirings with consequences
  controls: ControlDef[];           // variac setting, load steps, etc.
  physicsModel: string;             // key into the physics registry
  physicsParams: Record<string, number>;
  observationTable: ColumnDef[];    // what the student records
  learnSteps: LearnStep[];          // ordered tutorial
  hints: string[];                  // progressive, vague to specific
  solutionNote: string;
}

interface LearnStep {
  focus: string[];                  // component ids or terminal ids to highlight
  camera: 'overview' | 'supply' | 'transformer' | 'meters' | 'load';
  title: string;
  why: string;                      // the explanation shown in the popup
  connectTerminals?: [TerminalId, TerminalId][];   // wires drawn in this step
}

interface FaultPattern {
  id: string;
  description: string;              // shown to the student
  match: {
    connected?: [TerminalId, TerminalId][];
    notConnected?: [TerminalId, TerminalId][];
  };
  effect: 'no-reading' | 'reversed-reading' | 'wrong-reading' | 'danger' | 'short';
  effectTarget?: string;            // meter id
}
```

### Example: Exp 3.1 (load test of single-phase transformer), excerpt

Terminal names below are a draft and must be checked against Fig. 3.1.1 of the manual before building.

```ts
export const ex3_1: ExperimentDef = {
  id: 'ex3.1',
  title: 'Load test of single-phase transformer',
  components: [
    { id: 'sup', type: 'acSupply', label: '230 V AC supply', position: [-4,0,0], params: { V: 230 } },
    { id: 'va',  type: 'variac1ph', label: 'Autotransformer', position: [-2,0,0], params: { kVA: 3 } },
    { id: 'wm',  type: 'wattmeter', label: 'Wattmeter', position: [0,0,0], params: { vRange: 300, iRange: 10 } },
    { id: 'tx',  type: 'transformer1ph', label: '2 kVA 230/115 V', position: [2,0,0], params: { kVA: 2, V1: 230, V2: 115 } },
    { id: 'vp',  type: 'voltmeter', label: 'V primary', position: [0,0,2], params: { range: 300 } },
    { id: 'vs',  type: 'voltmeter', label: 'V secondary', position: [2,0,2], params: { range: 150 } },
    { id: 'am',  type: 'ammeter', label: 'A secondary', position: [4,0,0], params: { range: 20 } },
    { id: 'ld',  type: 'rheostatLoad', label: 'Resistive load', position: [6,0,0], params: { Rmin: 5, Rmax: 100 } },
  ],
  requiredNets: [
    ['sup.P', 'va.IN_P'],
    ['sup.N', 'va.IN_N', 'va.OUT_N', 'wm.V2', 'tx.P2', 'vp.B'],
    ['va.OUT_P', 'wm.M', 'wm.V1'],
    ['wm.L', 'tx.P1', 'vp.A'],
    ['tx.S1', 'vs.A', 'am.IN'],
    ['am.OUT', 'ld.A'],
    ['tx.S2', 'vs.B', 'ld.B'],
  ],
  faultPatterns: [
    { id: 'ammeter-parallel', description: 'The ammeter is across the load instead of in series with it.',
      match: { connected: [['am.IN', 'ld.A'], ['am.OUT', 'ld.B']] }, effect: 'short' },
    { id: 'wm-pressure-coil-open', description: 'The wattmeter pressure coil is not connected to the supply side.',
      match: { notConnected: [['wm.V2', 'sup.N']] }, effect: 'no-reading', effectTarget: 'wm' },
  ],
  physicsModel: 'transformerLoad',
  physicsParams: { a: 2, R2eq: 0.35, X2eq: 0.45, Pi: 18 },   // example values, tune later
  // controls, observationTable, learnSteps, hints, solutionNote omitted here
};
```

## 8. Wiring and validation

The student's wires are a list of terminal pairs. Validation runs in this order:

1. **Build nets.** Union-find over all wires produces the student's nets (sets of terminals that are electrically common).
2. **Check required nets.** For each required net, all its terminals must sit in the same student net. Missing ones are reported as open connections.
3. **Check shorts.** No student net may contain terminals from two different required nets. Such a net is reported as a short between those nets.
4. **Check extras.** Student nets that include terminals outside every required net are flagged as extra connections.
5. **Match fault patterns.** Each `FaultPattern` is tested against the student nets so the feedback can be specific.
6. **Return a result:** `{ correct, openNets, shorts, extras, faults, hintLevelAvailable }`.

This function is pure and fully unit testable: feed it a wire list, assert the result.

On Submit, a correct result leads to the success screen. An incorrect result leads to the fault explanation, then retry, hint, or the solution view (which draws the correct wires).

## 9. Simulation

Two parts, both pure TypeScript.

**Physics models** (one per experiment family) take the control state and a `ConnectionState` derived from the nets (for example, is the wattmeter energised, is the CT secondary open) and return true quantities. Starting with a template-per-experiment approach keeps v1 simple and the formulas traceable to the manual.

Exp 3.1 model, referred to the secondary side:

```
V1       = variac setting x supply voltage
V1'      = V1 / a
I2       = V1' / sqrt((R2eq + RL)^2 + X2eq^2)
V2       = I2 x RL
P_out    = I2^2 x RL
P_in     = P_out + I2^2 x R2eq + Pi x (V1 / V1rated)^2
```

**Meter model** turns true values into displayed readings: range selection, pointer deflection angle, clipping at full scale (with an overload warning), a small calibration error, and the wattmeter multiplying factor from Section 2.3.2 of the manual (`MF = V range x I range / divisions`).

**Fault effects** change the inputs to this pipeline (a meter reads zero, reverses, or a short triggers a trip warning) rather than bypassing it.

A later option, once the template approach feels limiting, is a general phasor-domain nodal solver so that arbitrary wrong wirings behave naturally. That is deliberately deferred.

## 10. Modes

**Learn mode**

- Steps through `learnSteps` in order.
- Each step moves the camera, highlights `focus` components, draws the listed wires, and opens a popup with the `why` text.
- The student can go back and forward, and each step is skippable.
- Includes a short guided meter-reading step at the end.

**Self mode**

- Starts with an empty bench. The student sets controls and wires terminals.
- Submit runs validation (Section 8).
- Hints come from `hints` in order, vague to specific. The solution view draws `requiredNets` as wires.
- After a correct result, the student can run the experiment: change the variac and load, and fill the observation table from live meter readings.

## 11. 3D interaction conventions

- **Wiring is click-based:** click terminal A, then terminal B, and a curved wire is created between them. Click a wire to delete it. Free-drag of wire ends is a later enhancement.
- Each terminal is a small clickable mesh with a hover label (for example `Wattmeter M`).
- Wires are tube geometry along a quadratic curve with slight sag, coloured by the net they belong to.
- Camera: orbit controls plus preset viewpoints (overview, per-component). Learn steps use presets.
- Apparatus are procedural primitives with a label texture. Real models (GLB) replace them without changing terminal ids.

## 12. State

| Store | Holds |
| --- | --- |
| sessionStore | current experiment id, mode, attempts, hint level, result |
| wiringStore | wire list (terminal pairs), selected terminal, derived nets |
| controlsStore | variac setting, load step, switches, meter range selections |

Derived values (nets, readings) are computed from these stores through pure functions and never stored separately.

## 13. Testing

- **Validation tests:** correct wiring passes; wire order does not matter; a missing wire, a swapped terminal, and a short each produce the expected result.
- **Physics tests:** compare model outputs with hand-calculated values from the manual's equations.
- **Schema test:** every experiment in the registry passes its Zod schema.
- 3D is verified manually.

## 14. Rules for the AI coding agent

Paste or keep these in the project's rules file.

1. Follow the layer rule: nothing under `src/core` imports React, three.js, or Zustand.
2. Never hard-code an experiment in a component. Experiment-specific content lives only in `src/core/experiments`.
3. Terminal ids must follow `componentId.terminalName` and match exactly between the definition and the 3D component.
4. Wiring validation must use nets (union-find), never wire-by-wire comparison.
5. Add or update a Vitest test whenever validation or physics logic changes.
6. Use primitive geometry for apparatus until told otherwise.
7. Do not invent electrical values or connections; use the experiment definition, and flag anything unclear instead of guessing.
8. Keep changes small and runnable at each step; do not rewrite files that are not part of the task.
9. Do not add a backend, auth, or new libraries without asking.

## 15. Milestones

1. **Engine skeleton:** project setup, bench scene, one component type, click-to-wire, net validation with tests.
2. **Exp 3.1 self mode:** all apparatus, correct and fault validation, meters, success and fail screens.
3. **Exp 3.1 learn mode:** learn steps, popups, camera presets, hints and solution view.
4. **Run phase:** variac and load controls, live readings, observation table.
5. **Exp 3.2:** second experiment as data plus any new components, to prove the architecture.
6. **Motor experiments (4.1, 4.2):** CT, two-wattmeter method, three-phase supply.
7. **Remaining experiments, polish, real models.**

## 16. Open decisions

- Generic bench versus a bench that mimics the college lab's actual apparatus and ratings.
- Whether three-phase wiring uses the same click-to-wire flow or a simplified view.
- Visual style (clean generic versus designed UI), to be revisited after milestone 3.
- Whether to add a general phasor solver after milestone 5.
