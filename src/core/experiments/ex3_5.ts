import {
  getCanonicalStageNetsForSeed,
  OBSERVE_FIXED_SEED,
} from '../phasor/ex3_5Scramble';
import { getRowNumber } from '../physics/report';
import type { ControlDef, ExperimentDef, ObservationRow } from '../types';

const EX3_5_CONTROLS: ControlDef[] = [
  {
    id: 'sup3.switch',
    componentId: 'sup3',
    kind: 'switch',
    label: '3φ Supply MCB',
    defaultValue: false,
  },
  {
    id: 'va3.knob',
    componentId: 'va3',
    kind: 'knob',
    label: '3φ Autotransformer Line Voltage',
    min: 0,
    max: 270,
    step: 1,
    fineStep: 0.1,
    unit: 'V',
    defaultValue: 0,
  },
];

function getRecordedVp(rowsByStage?: Record<string, ObservationRow[]>): number {
  const phaseRows = rowsByStage?.['identify-phases'] ?? [];
  const valid = phaseRows.filter((r) => {
    const v = getRowNumber(r, 'probeV');
    return v >= 100 && v <= 130;
  });
  if (valid.length > 0) {
    return getRowNumber(valid[valid.length - 1], 'probeV');
  }
  const starRows = rowsByStage?.['star'] ?? [];
  if (starRows.length > 0) {
    const v = getRowNumber(starRows[0], 'starPhaseV');
    if (v > 80) return v;
  }
  return 115;
}

export const ex3_5: ExperimentDef = {
  id: 'ex3.5',
  title: 'Study of various three-phase transformer connections',
  phasorReport: true,
  object: [
    'Identify six isolated 57.5 V secondary half-windings (T1–T12) and group them into three phases (a, b, c) with known relative polarities.',
    'Connect the three-phase secondary windings in Star (Y), Delta (Δ), and Zig-Zag (Interconnected Star) configurations and verify phase and line voltage relations.',
  ],
  components: [
    {
      id: 'sup3',
      type: 'acSupply3ph',
      label: '3φ AC Supply (230 V L-L)',
      position: [-3.3, 0, -1.35],
      params: { V: 230, frequency: 50, hideTerminals: true },
    },
    {
      id: 'va3',
      type: 'variac3ph',
      label: '3φ Autotransformer',
      position: [-1.6, 0, -1.35],
      params: { vIn: 230, vMax: 270, fineStep: 0.1, hideTerminals: true },
    },
    {
      id: 'tx',
      type: 'transformer3ph',
      label: '3φ Transformer Bank',
      position: [0.35, 0, 0.35],
      params: {
        primaryLineV: 230,
        halfEmfV: 57.5,
        hidePrimary: true,
        titlePlate: '3-PHASE TRANSFORMER',
        ratingPlate: '230 V Δ Pri / 6 × 57.5 V Sec (T1–T12)',
      },
    },
    {
      id: 'probe',
      type: 'probeVoltmeter',
      label: 'Probe Voltmeter',
      position: [2.45, 0, -0.35],
      params: { range: 300 },
    },
  ],
  stages: [
    {
      id: 'identify-pairs',
      title: '1. Winding Pairs',
      summary:
        'Use the Probe Voltmeter (no wires needed) to find the 6 isolated half-windings reading ~57.5 V and record them as W1–W6.',
      componentIds: ['sup3', 'va3', 'tx', 'probe'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [0.1, 4.6, 5.2], target: [0.1, 0.3, -0.2] },
        { id: 'terminals', label: 'Terminals T1–T12', pos: [0.35, 1.8, 3.1], target: [0.35, 0.15, 0.5] },
        { id: 'probe', label: 'Probe Meter', pos: [2.3, 2.0, 2.2], target: [2.1, 0.25, -0.2] },
      ],
      acceptedNetlists: [[]],
      netLabels: [],
      faultPatterns: [],
      controls: EX3_5_CONTROLS,
      physicsModel: 'phasor-connections',
      physicsParams: { stageKind: 1, primaryLineV: 230, halfEmfV: 57.5 },
      probeEnabled: true,
      identificationMode: 'winding-pairs',
      carryOver: 'none',
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' }, decimals: 0 },
        { id: 'va3V', label: 'Vpri (L-L)', shortLabel: 'Vpri', unit: 'V', source: { kind: 'control', controlId: 'va3.knob' }, decimals: 1 },
        { id: 'probeV', label: 'Probe V', shortLabel: 'Vprobe', unit: 'V', source: { kind: 'meter', meterId: 'probe', field: 'shownValue' }, decimals: 1 },
      ],
      rowRules: [
        {
          id: 'ex35-s1-vp',
          label: 'Primary line voltage = 230 V',
          message: 'Set the 3φ autotransformer to 230 ± 3 V before recording.',
          amber: true,
          highlightColumnIds: ['va3V'],
          predicate: (row) => {
            const v = getRowNumber(row, 'va3V');
            return v >= 227 && v <= 233;
          },
          failMessage: (p, t) => `${p}/${t} rows at 230 V line voltage.`,
          failHint: () => 'Adjust 3φ autotransformer knob to 230 V and record at least one ~57.5 V winding pair reading.',
        },
      ],
      prerequisites: [
        {
          id: 'ex35-s1-row',
          label: 'Record a half-winding probe reading (~57.5 V at 230 V)',
          predicate: (rows) =>
            rows.some((r) => {
              const vp = getRowNumber(r, 'va3V');
              const pr = getRowNumber(r, 'probeV');
              return vp >= 227 && vp <= 233 && pr >= 54 && pr <= 61;
            }),
          failMessage: 'Record at least one half-winding voltage reading (~57.5 V at 230 V).',
          failHint: 'Energise sup3 at 230 V, clip Red (+) & Black (-) probes across one pair reading ~57.5 V, and click Record Row.',
        },
      ],
      hints: [
        'Primary terminals are internally delta-connected (230 V). Do NOT place bench wires between T1–T12 in Stage 1.',
        'Switch ON the 3φ supply, set 3φ Variac to 230 V, then click Red Probe (+) and Black Probe (-) on pairs of terminals.',
        'Two terminals of the same isolated half-winding read ~57.5 V; terminals on different isolated windings read 0 V (no deflection). Record all 6 pairs in Winding Pairs (W1–W6).',
      ],
      solutionNote:
        'All 6 isolated half-windings (57.5 V each) are recorded with no bench jumpers between T1–T12.',
      learnSteps: [
        {
          id: 's1-intro',
          stageId: 'identify-pairs',
          title: 'Scrambled 12-terminal secondary',
          why:
            'The transformer primary is internally delta-connected for 230 V 3φ. Secondary terminals T1–T12 belong to 6 isolated 57.5 V half-windings in a scrambled order.',
          camera: 'overview',
          focus: ['tx', 'probe'],
        },
        {
          id: 's1-probe-pair',
          stageId: 'identify-pairs',
          title: 'Probe a half-winding (~57.5 V)',
          why:
            'Switch ON the 3φ supply and set the 3φ autotransformer to 230 V until the Probe Voltmeter shows ~57.5 V across one half-winding.',
          camera: 'terminals',
          focus: ['sup3', 'va3', 'probe'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'probe',
            targetV: 57.5,
            toleranceV: 2.0,
            unit: 'V',
            targetLabel: 'Half-winding voltage',
          },
        },
        {
          id: 's1-probe-diff',
          stageId: 'identify-pairs',
          title: 'Open terminals give zero deflection',
          why:
            'Probing two terminals from different isolated windings reads 0 V (no galvanic return path), allowing unambiguous pairing of W1–W6.',
          camera: 'probe',
          focus: ['probe', 'tx'],
        },
        {
          id: 's1-reveal-pairs',
          stageId: 'identify-pairs',
          title: 'Label winding pairs W1–W6',
          why:
            'Recording all six 57.5 V pairs labels the terminals W1 through W6 so phase grouping can begin in Stage 2.',
          camera: 'terminals',
          focus: ['tx'],
        },
      ],
    },
    {
      id: 'identify-phases',
      title: '2. Phases & Polarity',
      summary:
        'Series-join halves to identify which pairs belong to the same phase (0 V or 115 V vs 57.5/99.6 V), group phases a, b, c, and leave all three phases series-aiding (~115 V each).',
      componentIds: ['sup3', 'va3', 'tx', 'probe'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [0.1, 4.6, 5.2], target: [0.1, 0.3, -0.2] },
        { id: 'terminals', label: 'Terminals', pos: [0.35, 1.8, 3.1], target: [0.35, 0.15, 0.5] },
        { id: 'probe', label: 'Probe Meter', pos: [2.3, 2.0, 2.2], target: [2.1, 0.25, -0.2] },
      ],
      acceptedNetlists: [getCanonicalStageNetsForSeed('identify-phases', OBSERVE_FIXED_SEED)],
      netLabels: ['Phase a series (a2-a3)', 'Phase b series (b2-b3)', 'Phase c series (c2-c3)'],
      faultPatterns: [],
      controls: EX3_5_CONTROLS,
      physicsModel: 'phasor-connections',
      physicsParams: { stageKind: 2, primaryLineV: 230, halfEmfV: 57.5 },
      probeEnabled: true,
      identificationMode: 'phase-groups',
      carryOver: 'none',
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' }, decimals: 0 },
        { id: 'va3V', label: 'Vpri (L-L)', shortLabel: 'Vpri', unit: 'V', source: { kind: 'control', controlId: 'va3.knob' }, decimals: 1 },
        { id: 'probeV', label: 'Phase Vp', shortLabel: 'Vp', unit: 'V', source: { kind: 'meter', meterId: 'probe', field: 'shownValue' }, decimals: 1 },
      ],
      rowRules: [
        {
          id: 'ex35-s2-vp',
          label: 'Series-aiding phase Vp ≈ 115 V at 230 V',
          message: 'Record Vp ≈ 115 V across a series-aiding phase with Vpri at 230 ± 3 V.',
          amber: true,
          highlightColumnIds: ['va3V', 'probeV'],
          predicate: (row) => {
            const va = getRowNumber(row, 'va3V');
            const pr = getRowNumber(row, 'probeV');
            return va >= 227 && va <= 233 && pr >= 112 && pr <= 118;
          },
        },
      ],
      prerequisites: [
        {
          id: 'ex35-s2-row',
          label: 'Record full series-aiding phase voltage Vp (≈ 115 V)',
          predicate: (rows) =>
            rows.some((r) => {
              const va = getRowNumber(r, 'va3V');
              const pr = getRowNumber(r, 'probeV');
              return va >= 227 && va <= 233 && pr >= 112 && pr <= 118;
            }),
          failMessage: 'Record the series-aiding phase voltage Vp (≈ 115 V) before leaving Stage 2.',
          failHint: 'After joining two same-phase halves series-aiding (reading ~115 V), probe its outer ends at 230 V and click Record Row.',
        },
      ],
      hints: [
        'Shut OFF power before adding bench wires. Connect one terminal of W1 to one terminal of W2, energise to 230 V, and probe the two free ends.',
        'Different phases read 57.5 V (subtractive) or 99.6 V (additive). Same phase reads 0 V (opposing) or 115 V (aiding — reverse one half if 0 V).',
        'Assign all 6 pairs into Phases a, b, c (2 pairs each) in the panel, wire all three phases in series aiding (115 V each), then Submit.',
      ],
      solutionNote:
        'Each phase has its two 57.5 V halves joined in series aiding (a2–a3, b2–b3, c2–c3) to produce 115 V, revealing a1..c4.',
      learnSteps: [
        {
          id: 's2-series-opp',
          stageId: 'identify-phases',
          title: 'Series opposition test (~0 V)',
          why:
            'Connecting two same-phase halves in series opposition yields 0 V across the outer terminals, immediately distinguishing same-phase pairs from cross-phase pairs (57.5 V or 99.6 V).',
          camera: 'terminals',
          focus: ['tx', 'probe'],
        },
        {
          id: 's2-series-aid',
          stageId: 'identify-phases',
          title: 'Series-aiding full phase (115 V)',
          why:
            'Reversing one half yields 115 V series aiding for all three phases and reveals the polarity labels a1..a4, b1..b4, c1..c4. Bring Vpri to 230 V to verify Vp = 115 V.',
          camera: 'probe',
          focus: ['va3', 'probe', 'tx'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'probe',
            targetV: 115,
            toleranceV: 2.5,
            unit: 'V',
            targetLabel: 'Series-aiding Vp',
          },
        },
      ],
    },
    {
      id: 'star',
      title: '3. Star (Y)',
      summary:
        'Connect the secondary in Star (Fig. 3.5.1): join a2–a3, b2–b3, c2–c3 and bond a1–b1–c1 as neutral. Verify Vp ≈ 115 V and VL = √3·Vp ≈ 199.2 V.',
      componentIds: ['sup3', 'va3', 'tx', 'probe'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [0.1, 4.6, 5.2], target: [0.1, 0.3, -0.2] },
        { id: 'terminals', label: 'Star Wiring', pos: [0.35, 1.8, 3.1], target: [0.35, 0.15, 0.5] },
        { id: 'probe', label: 'Probe Meter', pos: [2.3, 2.0, 2.2], target: [2.1, 0.25, -0.2] },
      ],
      acceptedNetlists: [getCanonicalStageNetsForSeed('star', OBSERVE_FIXED_SEED)],
      netLabels: ['Star Neutral (a1-b1-c1)', 'Phase a (a2-a3)', 'Phase b (b2-b3)', 'Phase c (c2-c3)'],
      faultPatterns: [],
      controls: EX3_5_CONTROLS,
      physicsModel: 'phasor-connections',
      physicsParams: { stageKind: 3, primaryLineV: 230, halfEmfV: 57.5 },
      probeEnabled: true,
      carryOver: 'none',
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' }, decimals: 0 },
        { id: 'va3V', label: 'Vpri (L-L)', shortLabel: 'Vpri', unit: 'V', source: { kind: 'control', controlId: 'va3.knob' }, decimals: 1 },
        { id: 'probeV', label: 'Probe V', shortLabel: 'Vprobe', unit: 'V', source: { kind: 'meter', meterId: 'probe', field: 'shownValue' }, decimals: 1 },
        {
          id: 'starPhaseV',
          label: 'Star Vp',
          shortLabel: 'Vp(Y)',
          unit: 'V',
          source: { kind: 'hidden', capture: ({ output }) => output.outputs.starPhaseV ?? 0 },
          decimals: 1,
          hidden: false,
        },
        {
          id: 'starLineV',
          label: 'Star VL',
          shortLabel: 'VL(Y)',
          unit: 'V',
          source: { kind: 'hidden', capture: ({ output }) => output.outputs.starLineV ?? 0 },
          decimals: 1,
          hidden: false,
        },
      ],
      rowRules: [
        {
          id: 'ex35-s3-vp',
          label: 'Primary line voltage = 230 V',
          message: 'Hold 3φ autotransformer at 230 ± 3 V.',
          amber: true,
          highlightColumnIds: ['va3V'],
          predicate: (row) => {
            const va = getRowNumber(row, 'va3V');
            return va >= 227 && va <= 233;
          },
        },
      ],
      prerequisites: [
        {
          id: 'ex35-s3-row',
          label: 'Record Star (Y) voltage reading at 230 V (VL ≈ 199.2 V)',
          predicate: (rows) =>
            rows.some((r) => {
              const va = getRowNumber(r, 'va3V');
              const vl = getRowNumber(r, 'starLineV');
              return va >= 227 && va <= 233 && vl >= 190 && vl <= 208;
            }),
          failMessage: 'Record a Star (Y) observation row at 230 V.',
          failHint: 'Energise sup3 at 230 V with valid Star wiring and click Record Row.',
        },
      ],
      hints: [
        'Keep each phase in series aiding: a2–a3, b2–b3, c2–c3.',
        'Join one like-polarity end of every phase (a1, b1, c1) to form the common star neutral point.',
        'Leave a4, b4, c4 open as the three line terminals; probe a4–b4 for VL ≈ 199.2 V and a4–a1 for Vp ≈ 115 V.',
      ],
      solutionNote:
        'Star connection: a1–b1–c1 neutral star point, a2–a3, b2–b3, c2–c3 phase links; outputs a4, b4, c4 (Vp = 115 V, VL = 199.2 V).',
      learnSteps: [
        {
          id: 's3-wire-star',
          stageId: 'star',
          title: 'Wire Star (Y) secondary (Fig. 3.5.1)',
          why:
            'Each phase has its halves in series aiding (a2–a3, b2–b3, c2–c3), while a1, b1, and c1 are bonded to form the neutral star point.',
          camera: 'terminals',
          focus: ['tx'],
        },
        {
          id: 's3-read-star',
          stageId: 'star',
          title: 'Measure Star line voltage (199.2 V)',
          why:
            'Set the 3φ variac to 230 V. With probes on line terminals a4 and b4, the line voltage reads √3 × 115 ≈ 199.2 V.',
          camera: 'probe',
          focus: ['va3', 'probe'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'probe',
            targetV: 199.2,
            toleranceV: 3.5,
            unit: 'V',
            targetLabel: 'Star line voltage VL',
          },
        },
      ],
    },
    {
      id: 'delta',
      title: '4. Delta (Δ)',
      summary:
        'Connect the secondary in closed Delta (Fig. 3.5.2): series-aiding phases linked head-to-tail (a4–b1, b4–c1, c4–a1). Reversing one phase causes an unbalanced loop fault! Verify VL = Vp ≈ 115 V.',
      componentIds: ['sup3', 'va3', 'tx', 'probe'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [0.1, 4.6, 5.2], target: [0.1, 0.3, -0.2] },
        { id: 'terminals', label: 'Delta Wiring', pos: [0.35, 1.8, 3.1], target: [0.35, 0.15, 0.5] },
        { id: 'probe', label: 'Probe Meter', pos: [2.3, 2.0, 2.2], target: [2.1, 0.25, -0.2] },
      ],
      acceptedNetlists: [getCanonicalStageNetsForSeed('delta', OBSERVE_FIXED_SEED)],
      netLabels: ['a2-a3', 'b2-b3', 'c2-c3', 'Vertex a4-b1', 'Vertex b4-c1', 'Vertex c4-a1'],
      faultPatterns: [],
      controls: EX3_5_CONTROLS,
      physicsModel: 'phasor-connections',
      physicsParams: { stageKind: 4, primaryLineV: 230, halfEmfV: 57.5 },
      probeEnabled: true,
      carryOver: 'none',
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' }, decimals: 0 },
        { id: 'va3V', label: 'Vpri (L-L)', shortLabel: 'Vpri', unit: 'V', source: { kind: 'control', controlId: 'va3.knob' }, decimals: 1 },
        { id: 'probeV', label: 'Probe V', shortLabel: 'Vprobe', unit: 'V', source: { kind: 'meter', meterId: 'probe', field: 'shownValue' }, decimals: 1 },
        {
          id: 'deltaLineV',
          label: 'Delta VL',
          shortLabel: 'VL(Δ)',
          unit: 'V',
          source: { kind: 'hidden', capture: ({ output }) => output.outputs.deltaLineV ?? 0 },
          decimals: 1,
          hidden: false,
        },
      ],
      rowRules: [
        {
          id: 'ex35-s4-vp',
          label: 'Primary line voltage = 230 V',
          message: 'Hold 3φ autotransformer at 230 ± 3 V.',
          amber: true,
          highlightColumnIds: ['va3V'],
          predicate: (row) => {
            const va = getRowNumber(row, 'va3V');
            return va >= 227 && va <= 233;
          },
        },
      ],
      prerequisites: [
        {
          id: 'ex35-s4-row',
          label: 'Record Delta (Δ) voltage reading at 230 V (VL ≈ 115 V)',
          predicate: (rows) =>
            rows.some((r) => {
              const va = getRowNumber(r, 'va3V');
              const vl = getRowNumber(r, 'deltaLineV');
              return va >= 227 && va <= 233 && vl >= 110 && vl <= 120;
            }),
          failMessage: 'Record a Delta (Δ) observation row at 230 V.',
          failHint: 'Energise sup3 at 230 V with a balanced closed Delta wiring and click Record Row.',
        },
      ],
      hints: [
        'First join each phase in series aiding (a2–a3, b2–b3, c2–c3).',
        'Before closing the third corner of the Delta, check polarity carefully: vector sum Ea + Eb + Ec must equal 0 V!',
        'Join a4–b1, b4–c1, and c4–a1 cleanly; reversing any one phase drives heavy circulating current and trips the 3φ MCB.',
      ],
      solutionNote:
        'Balanced closed Delta: a2–a3, b2–b3, c2–c3 series links with corner joints a4–b1, b4–c1, c4–a1 (VL = Vp = 115 V).',
      learnSteps: [
        {
          id: 's4-wire-delta',
          stageId: 'delta',
          title: 'Wire closed Delta (Δ) (Fig. 3.5.2)',
          why:
            'Phases are joined head-to-tail (a4–b1, b4–c1, c4–a1). Because balanced phasors sum to zero around the loop, zero circulating current flows.',
          camera: 'terminals',
          focus: ['tx'],
        },
        {
          id: 's4-read-delta',
          stageId: 'delta',
          title: 'Measure Delta line voltage (115 V)',
          why:
            'Adjust 3φ variac to 230 V and probe between delta vertices (b4 and c4): VL = Vp = 115 V.',
          camera: 'probe',
          focus: ['va3', 'probe'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'probe',
            targetV: 115,
            toleranceV: 2.5,
            unit: 'V',
            targetLabel: 'Delta line voltage VL',
          },
        },
      ],
    },
    {
      id: 'zigzag',
      title: '5. Zig-Zag',
      summary:
        'Connect the secondary in Zig-Zag / Interconnected Star (Fig. 3.5.3): neutral a1–b1–c1, cross-phase links a2–b4, b2–c4, c2–a4; outputs b3, c3, a3. Verify Vp-zz = √3·57.5 ≈ 99.6 V and VL-zz = 1.5·Vp ≈ 172.5 V.',
      componentIds: ['sup3', 'va3', 'tx', 'probe'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [0.1, 4.6, 5.2], target: [0.1, 0.3, -0.2] },
        { id: 'terminals', label: 'Zig-Zag Wiring', pos: [0.35, 1.8, 3.1], target: [0.35, 0.15, 0.5] },
        { id: 'probe', label: 'Probe Meter', pos: [2.3, 2.0, 2.2], target: [2.1, 0.25, -0.2] },
      ],
      acceptedNetlists: [getCanonicalStageNetsForSeed('zigzag', OBSERVE_FIXED_SEED)],
      netLabels: ['Zig-Zag Neutral (a1-b1-c1)', 'Leg a2-b4', 'Leg b2-c4', 'Leg c2-a4'],
      faultPatterns: [],
      controls: EX3_5_CONTROLS,
      physicsModel: 'phasor-connections',
      physicsParams: { stageKind: 5, primaryLineV: 230, halfEmfV: 57.5 },
      probeEnabled: true,
      carryOver: 'none',
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' }, decimals: 0 },
        { id: 'va3V', label: 'Vpri (L-L)', shortLabel: 'Vpri', unit: 'V', source: { kind: 'control', controlId: 'va3.knob' }, decimals: 1 },
        { id: 'probeV', label: 'Probe V', shortLabel: 'Vprobe', unit: 'V', source: { kind: 'meter', meterId: 'probe', field: 'shownValue' }, decimals: 1 },
        {
          id: 'zigzagPhaseV',
          label: 'Zig-Zag Vp',
          shortLabel: 'Vp(ZZ)',
          unit: 'V',
          source: { kind: 'hidden', capture: ({ output }) => output.outputs.zigzagPhaseV ?? 0 },
          decimals: 1,
          hidden: false,
        },
        {
          id: 'zigzagLineV',
          label: 'Zig-Zag VL',
          shortLabel: 'VL(ZZ)',
          unit: 'V',
          source: { kind: 'hidden', capture: ({ output }) => output.outputs.zigzagLineV ?? 0 },
          decimals: 1,
          hidden: false,
        },
      ],
      rowRules: [
        {
          id: 'ex35-s5-vp',
          label: 'Primary line voltage = 230 V',
          message: 'Hold 3φ autotransformer at 230 ± 3 V.',
          amber: true,
          highlightColumnIds: ['va3V'],
          predicate: (row) => {
            const va = getRowNumber(row, 'va3V');
            return va >= 227 && va <= 233;
          },
        },
      ],
      prerequisites: [
        {
          id: 'ex35-s5-row',
          label: 'Record Zig-Zag reading at 230 V (Vp ≈ 99.6 V, VL ≈ 172.5 V)',
          predicate: (rows) =>
            rows.some((r) => {
              const va = getRowNumber(r, 'va3V');
              const vl = getRowNumber(r, 'zigzagLineV');
              return va >= 227 && va <= 233 && vl >= 165 && vl <= 180;
            }),
          failMessage: 'Record a Zig-Zag observation row at 230 V.',
          failHint: 'Energise sup3 at 230 V with valid Fig. 3.5.3 Zig-Zag wiring and click Record Row.',
        },
      ],
      hints: [
        'Join a1, b1, and c1 together to form the neutral star point (just like Star).',
        'Instead of joining a2–a3, connect each phase half-1 negative end to the NEXT phase half-2 negative end: a2–b4, b2–c4, c2–a4.',
        'The remaining open terminals (b3, c3, a3) act as the 3 output lines: V(b3–N) = -Ea + Eb = 99.6 V and V(b3–c3) = 172.5 V.',
      ],
      solutionNote:
        'Zig-Zag Fig. 3.5.3: Neutral a1–b1–c1, cross-phase joints a2–b4, b2–c4, c2–a4, outputs b3, c3, a3 (Vp-zz = 99.6 V, VL-zz = 172.5 V).',
      learnSteps: [
        {
          id: 's5-wire-zigzag',
          stageId: 'zigzag',
          title: 'Wire Zig-Zag secondary (Fig. 3.5.3)',
          why:
            'Join a1–b1–c1 for neutral, then connect a2–b4, b2–c4, and c2–a4 so every output phase subtracts two half-windings displaced by 120° (yielding 60° vector addition = 99.6 V).',
          camera: 'terminals',
          focus: ['tx'],
        },
        {
          id: 's5-read-zigzag',
          stageId: 'zigzag',
          title: 'Measure Zig-Zag line voltage (172.5 V)',
          why:
            'Set 3φ variac to 230 V. With probes on b3 and c3, the line-to-line voltage reads 1.5 × Vp ≈ 172.5 V.',
          camera: 'probe',
          focus: ['va3', 'probe'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'probe',
            targetV: 172.5,
            toleranceV: 3.5,
            unit: 'V',
            targetLabel: 'Zig-Zag line voltage VL',
          },
        },
      ],
    },
  ],
  answers: [
    {
      id: 'starLineV',
      label: 'Star (Y) line-to-line voltage (VL = √3·Vp)',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 199.2',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number((getRecordedVp(rowsByStage) * Math.sqrt(3)).toFixed(2)),
      tolerance: { rel: 0.03 },
      failHint: () => 'Compute VL(Star) = √3 × Vp (with Vp ≈ 115 V -> 199.2 V).',
    },
    {
      id: 'deltaLineV',
      label: 'Delta (Δ) line-to-line voltage (VL = Vp)',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 115.0',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(getRecordedVp(rowsByStage).toFixed(2)),
      tolerance: { rel: 0.03 },
      failHint: () => 'In Delta, line voltage equals full phase voltage: VL = Vp ≈ 115 V.',
    },
    {
      id: 'zigzagPhaseV',
      label: 'Zig-Zag phase-to-neutral voltage (Vp-zz)',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 99.6',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(((getRecordedVp(rowsByStage) * Math.sqrt(3)) / 2).toFixed(2)),
      tolerance: { rel: 0.03 },
      failHint: () => 'Each Zig-Zag leg subtracts two 120°-apart halves (57.5 V): Vp-zz = √3 × (Vp/2) ≈ 99.6 V.',
    },
    {
      id: 'zigzagLineV',
      label: 'Zig-Zag line-to-line voltage (VL-zz = √3·Vp-zz = 1.5·Vp)',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 172.5',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number((getRecordedVp(rowsByStage) * 1.5).toFixed(2)),
      tolerance: { rel: 0.03 },
      failHint: () => 'Compute VL(Zig-Zag) = √3 × Vp-zz = 1.5 × Vp (with Vp ≈ 115 V -> 172.5 V).',
    },
    {
      id: 'highestLineConn',
      label: 'Which connection yields the highest secondary line voltage?',
      kind: 'choice',
      options: [
        { value: 'star', label: 'Star (Y) — 199.2 V' },
        { value: 'delta', label: 'Delta (Δ) — 115.0 V' },
        { value: 'zigzag', label: 'Zig-Zag — 172.5 V' },
      ],
      truth: () => 'star',
      failHint: () => 'Star gives √3·Vp (199.2 V), above Zig-Zag (1.5·Vp = 172.5 V) and Delta (1.0·Vp = 115 V).',
    },
    {
      id: 'sampleDiffPhasesLow',
      label: 'Sample Q2: Two 50 V halves on DIFFERENT phases in series — lower voltage',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 50',
      step: '0.1',
      truth: () => 50,
      tolerance: { abs: 2 },
      failHint: () => 'Vector sum of two 50 V phasors 120° apart: |50∠0° + 50∠120°| = 50 V.',
    },
    {
      id: 'sampleDiffPhasesHigh',
      label: 'Sample Q2: Two 50 V halves on DIFFERENT phases in series — higher voltage',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 86.6',
      step: '0.1',
      truth: () => 86.6,
      tolerance: { abs: 2 },
      failHint: () => 'Vector difference of two 50 V phasors 120° apart: |50∠0° − 50∠120°| = 50√3 ≈ 86.6 V.',
    },
    {
      id: 'sampleSamePhaseLow',
      label: 'Sample Q2: Two 50 V halves on SAME phase in series — opposing voltage',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 0',
      step: '0.1',
      truth: () => 0,
      tolerance: { abs: 2 },
      failHint: () => 'Series opposition on the same phase cancels completely: 50 − 50 = 0 V.',
    },
    {
      id: 'sampleSamePhaseHigh',
      label: 'Sample Q2: Two 50 V halves on SAME phase in series — aiding voltage',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 100',
      step: '0.1',
      truth: () => 100,
      tolerance: { abs: 2 },
      failHint: () => 'Series aiding on the same phase adds directly: 50 + 50 = 100 V.',
    },
  ],
  hints: [
    'Start with zero bench wires in Stage 1 to probe and record the 6 half-winding pairs (57.5 V each).',
    'Series-connect halves in Stage 2 (0 V / 115 V = same phase; 57.5 V / 99.6 V = different phase) to uncover a1..c4.',
    'Keep primary 3φ supply at 230 V line-to-line while measuring Star (115 / 199.2 V), Delta (115 V), and Zig-Zag (99.6 / 172.5 V).',
  ],
  solutionNote:
    'Stage 1–2 identify the scrambled 6 × 57.5 V half-windings as a1..c4; Stages 3–5 verify Star (199.2 V), Delta (115 V), and Zig-Zag Fig. 3.5.3 (99.6 V phase, 172.5 V line).',
};
