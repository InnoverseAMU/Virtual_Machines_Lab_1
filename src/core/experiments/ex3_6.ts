import { canonicalPairKey } from '../phasor/ex3_5Scramble';
import { getRowNumber } from '../physics/report';
import type { ControlDef, ExperimentDef, Net, ObservationRow } from '../types';

const EX3_6_CONTROLS: ControlDef[] = [
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

const PRI_NETS_STAGE12: Net[] = [
  ['sup3.A', 'va3.IN_A'],
  ['sup3.B', 'va3.IN_B'],
  ['sup3.C', 'va3.IN_C'],
  ['va3.OUT_A', 'tx.A'],
  ['va3.OUT_B', 'tx.B'],
  ['va3.OUT_C', 'tx.C'],
];

const STAGE1_NETS: Net[] = [
  ...PRI_NETS_STAGE12,
  ['tx.a2', 'tx.a3'],
  ['tx.b2', 'tx.b3'],
  ['tx.c2', 'tx.c3'],
  ['tx.c4', 'tx.b4'],
  ['tx.b1', 'tx.a4'],
];

const STAGE2_NETS: Net[] = [
  ...PRI_NETS_STAGE12,
  ['tx.a2', 'tx.b2', 'tx.c2', 'tx.a3', 'tx.b3', 'tx.c3'],
];

const SCOTT_PRIMARY_BC: Net[] = [
  ['sup3.A', 'va3.IN_A'],
  ['sup3.B', 'va3.IN_B'],
  ['sup3.C', 'va3.IN_C'],
  ['va3.OUT_A', 'txT.A1'],
  ['txT.A2', 'txM.M'],
  ['va3.OUT_B', 'txM.B1'],
  ['va3.OUT_C', 'txM.B2'],
];

const SCOTT_PRIMARY_CB: Net[] = [
  ['sup3.A', 'va3.IN_A'],
  ['sup3.B', 'va3.IN_B'],
  ['sup3.C', 'va3.IN_C'],
  ['va3.OUT_A', 'txT.A1'],
  ['txT.A2', 'txM.M'],
  ['va3.OUT_B', 'txM.B2'],
  ['va3.OUT_C', 'txM.B1'],
];

export const STAGE2_REQUIRED_PAIRS: readonly [string, string][] = [
  // Six phase voltages relative to neutral point n
  ['tx.a2', 'tx.a1'],
  ['tx.b3', 'tx.b4'],
  ['tx.c2', 'tx.c1'],
  ['tx.a3', 'tx.a4'],
  ['tx.b2', 'tx.b1'],
  ['tx.c3', 'tx.c4'],
  // Six adjacent line voltages
  ['tx.a1', 'tx.b4'],
  ['tx.b4', 'tx.c1'],
  ['tx.c1', 'tx.a4'],
  ['tx.a4', 'tx.b1'],
  ['tx.b1', 'tx.c4'],
  ['tx.c4', 'tx.a1'],
] as const;

const STAGE2_PHASE_KEYS = new Set(
  STAGE2_REQUIRED_PAIRS.slice(0, 6).map(([a, b]) => canonicalPairKey(a, b)),
);
const STAGE2_ADJ_KEYS = new Set(
  STAGE2_REQUIRED_PAIRS.slice(6, 12).map(([a, b]) => canonicalPairKey(a, b)),
);

function avgCol(rows: ObservationRow[], col: string, fallback: number): number {
  const vals = rows.map((r) => getRowNumber(r, col)).filter((v) => v > 1);
  if (vals.length === 0) return fallback;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function getStage2Mean(
  rowsByStage: Record<string, ObservationRow[]> | undefined,
  keys: Set<string>,
  fallback: number,
): number {
  const rows = rowsByStage?.['three-to-six'] ?? [];
  const matched = rows
    .filter((r) => keys.has(String(r.values.pairKey ?? r.pairKey ?? '')))
    .map((r) => getRowNumber(r, 'probeV'))
    .filter((v) => v > 1);
  if (matched.length === 0) return fallback;
  return matched.reduce((s, v) => s + v, 0) / matched.length;
}

export const ex3_6: ExperimentDef = {
  id: 'ex3.6',
  title: 'Phase-transformation',
  phasorReport: 'transformations',
  object: [
    'Transform a three-phase 230 V supply into (i) single-phase supply (open-delta series at 2·Vp ≈ 230 V), (ii) six-phase supply (double-star at 57.5 V, 60° steps), and (iii) two-phase supply via Scott-connected transformers.',
  ],
  components: [
    {
      id: 'sup3',
      type: 'acSupply3ph',
      label: '3φ AC Supply (230 V L-L)',
      position: [-3.3, 0, -1.45],
      params: { V: 230, frequency: 50, hideTerminals: false },
    },
    {
      id: 'va3',
      type: 'variac3ph',
      label: '3φ Autotransformer',
      position: [-1.55, 0, -1.45],
      params: { vIn: 230, vMax: 270, fineStep: 0.1, hideTerminals: false },
    },
    {
      id: 'tx',
      type: 'transformer3phTrue',
      label: '3φ Transformer (True Labels)',
      position: [0.45, 0, 0.35],
      params: {
        primaryLineV: 230,
        halfEmfV: 57.5,
        hidePrimary: false,
        titlePlate: '3-PHASE TRANSFORMER',
        ratingPlate: '230 V Δ Pri / 6 × 57.5 V Sec (a1–c4)',
      },
    },
    {
      id: 'txM',
      type: 'transformerCenterTap',
      label: 'Main Transformer (txM)',
      position: [-0.35, 0, 0.45],
      params: {
        titlePlate: 'MAIN TX (2:1)',
        subPlate: '230 V B1–M–B2 / 115 V b1–b2',
        pPlate: 'PRI B1 · M · B2',
        sPlate: 'SEC b1 · b2',
      },
    },
    {
      id: 'txT',
      type: 'transformerTeaser',
      label: 'Teaser Transformer (txT)',
      position: [1.4, 0, 0.45],
      params: {
        titlePlate: 'TEASER TX (1.732:1)',
        subPlate: '199.2 V A1–A2 / 115 V a1–a2',
        pPlate: 'PRI A1 · A2',
        sPlate: 'SEC a1 · a2',
      },
    },
    {
      id: 'probe',
      type: 'probeVoltmeter',
      label: 'Probe Voltmeter',
      position: [3.1, 0, -0.35],
      params: { range: 300 },
    },
  ],
  stages: [
    {
      id: 'three-to-single',
      title: '1. 3φ to 1φ',
      summary:
        'Feed the delta primary from sup3 via va3; join each phase series-aiding (a2-a3, b2-b3, c2-c3) and link c4-b4 and b1-a4 (Fig. 3.6.1). Measure Va1a4, Vb1b4, Vc1c4 (~115 V) and single-phase output Va1c1 (~230 V).',
      componentIds: ['sup3', 'va3', 'tx', 'probe'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [0.0, 4.9, 5.4], target: [0.0, 0.3, -0.3] },
        { id: 'primary', label: 'Supply & Primary', pos: [-1.4, 3.0, 3.3], target: [-1.4, 0.25, -0.6] },
        { id: 'secondary', label: 'Secondary & Probe', pos: [1.2, 2.2, 3.2], target: [1.1, 0.2, 0.1] },
      ],
      acceptedNetlists: [STAGE1_NETS],
      netLabels: [
        'Supply R -> Variac A',
        'Supply Y -> Variac B',
        'Supply B -> Variac C',
        'Variac A -> Pri A',
        'Variac B -> Pri B',
        'Variac C -> Pri C',
        'Phase a (a2-a3)',
        'Phase b (b2-b3)',
        'Phase c (c2-c3)',
        'Series link c4-b4',
        'Series link b1-a4',
      ],
      faultPatterns: [],
      controls: EX3_6_CONTROLS,
      physicsModel: 'phase-transformation',
      physicsParams: { stageKind: 1, primaryLineV: 230, halfEmfV: 57.5 },
      probeEnabled: true,
      carryOver: 'consistent-wires',
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' }, decimals: 0 },
        { id: 'va3V', label: 'Vpri (L-L)', shortLabel: 'Vpri', unit: 'V', source: { kind: 'control', controlId: 'va3.knob' }, decimals: 1 },
        { id: 'probeV', label: 'Probe V', shortLabel: 'Vprobe', unit: 'V', source: { kind: 'meter', meterId: 'probe', field: 'shownValue' }, decimals: 1 },
        { id: 'Va1a4', label: 'Va1a4', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.Va1a4 ?? 0 }, decimals: 1, hidden: false },
        { id: 'Vb1b4', label: 'Vb1b4', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.Vb1b4 ?? 0 }, decimals: 1, hidden: false },
        { id: 'Vc1c4', label: 'Vc1c4', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.Vc1c4 ?? 0 }, decimals: 1, hidden: false },
        { id: 'Va1c1', label: 'Va1c1', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.Va1c1 ?? 0 }, decimals: 1, hidden: false },
      ],
      rowRules: [
        {
          id: 'ex36-s1-vp',
          label: 'Primary line voltage = 230 V',
          message: 'Hold 3φ autotransformer at 230 ± 3 V.',
          amber: true,
          highlightColumnIds: ['va3V'],
          predicate: (row) => {
            const v = getRowNumber(row, 'va3V');
            return v >= 227 && v <= 233;
          },
        },
      ],
      prerequisites: [
        {
          id: 'ex36-s1-row',
          label: 'Record Fig. 3.6.1 phase & single-phase output voltages at 230 V (Va1c1 ≈ 230 V)',
          predicate: (rows) =>
            rows.some((r) => {
              const va = getRowNumber(r, 'va3V');
              const out = getRowNumber(r, 'Va1c1');
              return va >= 227 && va <= 233 && out >= 220 && out <= 240;
            }),
          failMessage: 'Record Stage 1 readings at 230 V showing Va1c1 ≈ 230 V.',
          failHint: 'Energise sup3 at 230 V with Fig. 3.6.1 wired, probe a1–c1, and click Record Row.',
        },
      ],
      hints: [
        'Feed sup3 A/B/C -> va3 IN_A/B/C and va3 OUT_A/B/C -> tx A/B/C.',
        'Connect each secondary phase in series aiding: a2-a3, b2-b3, c2-c3.',
        'Chain the three secondary phases as in Fig. 3.6.1: c4-b4 and b1-a4. Then Ea + Eb - Ec = -2·Ec gives 230 V between a1 and c1.',
      ],
      solutionNote:
        '3φ to 1φ: primary fed from sup3->va3->tx(A,B,C), series phases a2-a3/b2-b3/c2-c3 linked c4-b4 & b1-a4; output a1–c1 = 230 V.',
      learnSteps: [
        {
          id: 's1-why',
          stageId: 'three-to-single',
          title: 'Why transform 3φ to 1φ?',
          why:
            'Converting three-phase to single-phase spreads a heavy single-phase load evenly across all three supply phases instead of overloading one line. All six secondary terminals use their true labels (a1–c4).',
          camera: 'overview',
          focus: ['sup3', 'tx'],
        },
        {
          id: 's1-wire',
          stageId: 'three-to-single',
          title: 'Wire Fig. 3.6.1 open-series secondary',
          why:
            'Connect sup3 -> va3 -> tx(A,B,C), join each phase aiding (a2-a3, b2-b3, c2-c3), then link c4-b4 and b1-a4 so V(a1–c1) equals Ea + Eb − Ec = −2·Ec.',
          camera: 'secondary',
          focus: ['tx'],
          connectTerminals: [
            ['sup3.A', 'va3.IN_A'],
            ['sup3.B', 'va3.IN_B'],
            ['sup3.C', 'va3.IN_C'],
            ['va3.OUT_A', 'tx.A'],
            ['va3.OUT_B', 'tx.B'],
            ['va3.OUT_C', 'tx.C'],
            ['tx.a2', 'tx.a3'],
            ['tx.b2', 'tx.b3'],
            ['tx.c2', 'tx.c3'],
            ['tx.c4', 'tx.b4'],
            ['tx.b1', 'tx.a4'],
          ],
        },
        {
          id: 's1-measure',
          stageId: 'three-to-single',
          title: 'Verify Va1c1 = 2·Vp ≈ 230 V',
          why:
            'Switch ON sup3 and raise va3 to 230 V. Probe terminals a1 and c1: the combined single-phase output reads 2 × 115 V = 230 V (Fig. 3.6.2 phasor sum).',
          camera: 'secondary',
          focus: ['va3', 'probe', 'tx'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'probe',
            targetV: 230,
            toleranceV: 4,
            unit: 'V',
            targetLabel: 'Single-phase output Va1c1',
          },
        },
      ],
    },
    {
      id: 'three-to-six',
      title: '2. 3φ to 6φ (Double Star)',
      summary:
        'Keep the primary feed and join a2, b2, c2, a3, b3, c3 into a single double-star neutral n (Fig. 3.6.3). Probe all twelve required pairs (six 57.5 V phases + six 57.5 V adjacent line voltages).',
      componentIds: ['sup3', 'va3', 'tx', 'probe'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [0.0, 4.9, 5.4], target: [0.0, 0.3, -0.3] },
        { id: 'primary', label: 'Primary', pos: [-1.4, 3.0, 3.3], target: [-1.4, 0.25, -0.6] },
        { id: 'secondary', label: 'Double Star', pos: [1.1, 2.1, 3.1], target: [0.9, 0.2, 0.2] },
      ],
      acceptedNetlists: [STAGE2_NETS],
      netLabels: [
        'Supply R -> Variac A',
        'Supply Y -> Variac B',
        'Supply B -> Variac C',
        'Variac A -> Pri A',
        'Variac B -> Pri B',
        'Variac C -> Pri C',
        'Double-Star Neutral n (a2,b2,c2,a3,b3,c3)',
      ],
      faultPatterns: [],
      controls: EX3_6_CONTROLS,
      physicsModel: 'phase-transformation',
      physicsParams: { stageKind: 2, primaryLineV: 230, halfEmfV: 57.5 },
      probeEnabled: true,
      carryOver: 'consistent-wires',
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' }, decimals: 0 },
        {
          id: 'pairLabel',
          label: 'Probed Pair',
          source: {
            kind: 'hidden',
            capture: ({ controls }) => {
              const a = String(controls['probe.a'] ?? '').replace(/^tx\./, '');
              const b = String(controls['probe.b'] ?? '').replace(/^tx\./, '');
              return a && b ? `${a} – ${b}` : '--';
            },
          },
          hidden: false,
        },
        {
          id: 'pairKey',
          label: 'PairKey',
          source: {
            kind: 'hidden',
            capture: ({ controls }) =>
              canonicalPairKey(
                String(controls['probe.a'] ?? ''),
                String(controls['probe.b'] ?? ''),
              ),
          },
          hidden: true,
        },
        { id: 'va3V', label: 'Vpri (L-L)', shortLabel: 'Vpri', unit: 'V', source: { kind: 'control', controlId: 'va3.knob' }, decimals: 1 },
        { id: 'probeV', label: 'Probe V', shortLabel: 'Vprobe', unit: 'V', source: { kind: 'meter', meterId: 'probe', field: 'shownValue' }, decimals: 1 },
      ],
      rowRules: [
        {
          id: 'ex36-s2-vp',
          label: 'Primary line voltage = 230 V',
          message: 'Hold 3φ autotransformer at 230 ± 3 V.',
          amber: true,
          highlightColumnIds: ['va3V'],
          predicate: (row) => {
            const v = getRowNumber(row, 'va3V');
            return v >= 227 && v <= 233;
          },
        },
      ],
      prerequisites: [
        {
          id: 'ex36-s2-all12',
          label: (rows) => {
            const seen = new Set(
              rows
                .filter((r) => {
                  const v = getRowNumber(r, 'va3V');
                  return v >= 227 && v <= 233;
                })
                .map((r) => String(r.values.pairKey ?? r.pairKey ?? '')),
            );
            const count = STAGE2_REQUIRED_PAIRS.filter(([a, b]) =>
              seen.has(canonicalPairKey(a, b)),
            ).length;
            return `Probe & record all 12 manual pairs at 230 V (${count}/12 recorded)`;
          },
          predicate: (rows) => {
            const seen = new Set(
              rows
                .filter((r) => {
                  const v = getRowNumber(r, 'va3V');
                  return v >= 227 && v <= 233;
                })
                .map((r) => String(r.values.pairKey ?? r.pairKey ?? '')),
            );
            return STAGE2_REQUIRED_PAIRS.every(([a, b]) =>
              seen.has(canonicalPairKey(a, b)),
            );
          },
          failMessage: 'Probe and record all 12 phase and adjacent-line pairs in Stage 2 before continuing.',
          failHint:
            'With va3 at 230 V, probe all 6 phase pairs (a2-a1, b3-b4, c2-c1, a3-a4, b2-b1, c3-c4) and all 6 adjacent pairs (a1-b4, b4-c1, c1-a4, a4-b1, b1-c4, c4-a1), clicking Add Row for each.',
        },
      ],
      hints: [
        'Primary wiring carries over cleanly.',
        'Bond a2, b2, c2, a3, b3, c3 into a single common double-star neutral point n.',
        'Outer terminals sit in 60° order around n: a1 (0°), b4 (60°), c1 (120°), a4 (180°), b1 (240°), c4 (300°). Probe all 6 phase pairs + 6 adjacent line pairs (~57.5 V each).',
      ],
      solutionNote:
        'Double-star 6φ: primary intact; common neutral n connects a2-b2-c2-a3-b3-c3 leaving a1, b4, c1, a4, b1, c4 spaced 60° apart at 57.5 V.',
      learnSteps: [
        {
          id: 's2-why',
          stageId: 'three-to-six',
          title: 'Why 6-phase double star for rectifiers?',
          why:
            'Joining one normal star and one inverted star at neutral point n creates six 60°-spaced phases of 57.5 V each. Polyphase rectifiers use this double-star connection because the shared neutral provides a return path for DC load current with low ripple.',
          camera: 'secondary',
          focus: ['tx'],
        },
        {
          id: 's2-wire',
          stageId: 'three-to-six',
          title: 'Form common double-star neutral n (Fig. 3.6.3)',
          why:
            'Shut off power, remove Stage 1 secondary jumpers, and join a2, b2, c2, a3, b3, c3 to one neutral bus.',
          camera: 'secondary',
          focus: ['tx'],
          disconnectTerminals: [
            ['tx.c4', 'tx.b4'],
            ['tx.b1', 'tx.a4'],
          ],
          connectTerminals: [
            ['tx.a2', 'tx.b2'],
            ['tx.b2', 'tx.c2'],
            ['tx.c2', 'tx.a3'],
            ['tx.a3', 'tx.b3'],
            ['tx.b3', 'tx.c3'],
          ],
        },
        {
          id: 's2-phase',
          stageId: 'three-to-six',
          title: 'Measure 6-phase voltage (57.5 V)',
          why:
            'At 230 V primary, each phase terminal (a1, b4, c1, a4, b1, c4) measures 57.5 V to neutral n and 57.5 V between any two 60°-adjacent lines.',
          camera: 'secondary',
          focus: ['va3', 'probe'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'probe',
            targetV: 57.5,
            toleranceV: 2.0,
            unit: 'V',
            targetLabel: 'Adjacent / phase 6φ voltage',
          },
        },
        {
          id: 's2-opp',
          stageId: 'three-to-six',
          title: 'Check opposite terminals (a1 to a4 = 115 V)',
          why:
            'Opposite vectors 180° apart (a1 and a4, b4 and b1, c1 and c4) add diametrically to 2 × 57.5 = 115 V.',
          camera: 'secondary',
          focus: ['probe', 'tx'],
        },
      ],
    },
    {
      id: 'three-to-two-scott',
      title: '3. 3φ to 2φ (Scott)',
      summary:
        'Connect Main (txM) across phases B–C and Teaser (txT) from phase A to center tap M (Fig. 3.6.4). Measure VAB, VBC, VCA, VB1B2, VA1A2 (~199.2 V), Va1a2, Vb1b2 (~115 V), and Va1b1 after joining a2-b2 (~162.6 V).',
      componentIds: ['sup3', 'va3', 'txM', 'txT', 'probe'],
      cameraPresets: [
        { id: 'overview', label: 'Overview', pos: [0.0, 5.0, 5.5], target: [0.1, 0.3, -0.3] },
        { id: 'scott-pri', label: 'Scott Primaries', pos: [0.3, 2.7, 3.2], target: [0.3, 0.25, 0.0] },
        { id: 'scott-sec', label: '2φ Secondaries & Probe', pos: [1.5, 2.3, 3.0], target: [1.5, 0.25, 0.1] },
      ],
      acceptedNetlists: [
        [...SCOTT_PRIMARY_BC, ['txT.a2', 'txM.b2']],
        SCOTT_PRIMARY_BC,
        [...SCOTT_PRIMARY_CB, ['txT.a2', 'txM.b2']],
        SCOTT_PRIMARY_CB,
      ],
      netLabels: [
        'Supply R -> Variac A',
        'Supply Y -> Variac B',
        'Supply B -> Variac C',
        'Variac A -> Teaser A1',
        'Teaser A2 -> Main Center Tap M',
        'Variac B -> Main B1',
        'Variac C -> Main B2',
        '2φ Common Return (a2 - b2)',
      ],
      faultPatterns: [],
      controls: EX3_6_CONTROLS,
      physicsModel: 'phase-transformation',
      physicsParams: {
        stageKind: 3,
        primaryLineV: 230,
        ratioMain: 2.0,
        ratioTeaser: Math.sqrt(3),
      },
      probeEnabled: true,
      carryOver: 'consistent-wires',
      observationTable: [
        { id: 'sno', label: 'S.No', source: { kind: 'sno' }, decimals: 0 },
        { id: 'va3V', label: 'Vpri (L-L)', shortLabel: 'Vpri', unit: 'V', source: { kind: 'control', controlId: 'va3.knob' }, decimals: 1 },
        { id: 'probeV', label: 'Probe V', shortLabel: 'Vprobe', unit: 'V', source: { kind: 'meter', meterId: 'probe', field: 'shownValue' }, decimals: 1 },
        { id: 'VAB', label: 'VAB', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.VAB ?? 0 }, decimals: 1, hidden: false },
        { id: 'VBC', label: 'VBC', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.VBC ?? 0 }, decimals: 1, hidden: false },
        { id: 'VCA', label: 'VCA', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.VCA ?? 0 }, decimals: 1, hidden: false },
        { id: 'VB1B2', label: 'VB1B2', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.VB1B2 ?? 0 }, decimals: 1, hidden: false },
        { id: 'VA1A2', label: 'VA1A2 (VAM)', shortLabel: 'VA1A2', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.VA1A2 ?? 0 }, decimals: 1, hidden: false },
        { id: 'Va1a2', label: 'Va1a2', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.Va1a2 ?? 0 }, decimals: 1, hidden: false },
        { id: 'Vb1b2', label: 'Vb1b2', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.Vb1b2 ?? 0 }, decimals: 1, hidden: false },
        { id: 'Va1b1', label: 'Va1b1', unit: 'V', source: { kind: 'hidden', capture: ({ output }) => output.outputs.Va1b1 ?? 0 }, decimals: 1, hidden: false },
      ],
      rowRules: [
        {
          id: 'ex36-s3-vp',
          label: 'Primary line voltage = 230 V',
          message: 'Hold 3φ autotransformer at 230 ± 3 V.',
          amber: true,
          highlightColumnIds: ['va3V'],
          predicate: (row) => {
            const v = getRowNumber(row, 'va3V');
            return v >= 227 && v <= 233;
          },
        },
      ],
      prerequisites: [
        {
          id: 'ex36-s3-scott',
          label: 'Record Scott readings at 230 V with Va1b1 ≈ 162.6 V (a2–b2 joined)',
          predicate: (rows) =>
            rows.some((r) => {
              const va = getRowNumber(r, 'va3V');
              const vam = getRowNumber(r, 'VA1A2');
              const vab2 = getRowNumber(r, 'Va1b1');
              return va >= 227 && va <= 233 && vam >= 192 && vam <= 207 && vab2 >= 155 && vab2 <= 170;
            }),
          failMessage: 'Record Scott connection voltages at 230 V with a2–b2 joined (Va1b1 ≈ 162.6 V).',
          failHint: 'Wire Fig. 3.6.4 plus a2–b2 common bond, set va3 to 230 V, and click Record Row.',
        },
      ],
      hints: [
        'Keep sup3 -> va3 wired on the supply side.',
        'Connect va3.OUT_B -> txM.B1 and va3.OUT_C -> txM.B2; connect va3.OUT_A -> txT.A1 and txT.A2 -> txM.M (center tap!).',
        'Leave secondaries open to probe Va1a2 & Vb1b2 (115 V each), then join txT.a2 to txM.b2 so Va1b1 = √2 × 115 ≈ 162.6 V.',
      ],
      solutionNote:
        'Scott connection (Fig. 3.6.4): B/C across B1–B2, A to A1, A2 to center tap M (VAM = 199.2 V at 90° to VBC); a2–b2 joined gives Va1b1 = 162.6 V.',
      learnSteps: [
        {
          id: 's3-why',
          stageId: 'three-to-two-scott',
          title: 'Scott principle & √3/2 teaser ratio',
          why:
            'The Scott connection feeds two-phase loads such as electric arc furnaces cleanly from three phases. Tapping the Main primary midpoint M places VAM = (√3/2)·VL = 199.2 V exactly 90° out of phase with VBC, so a teaser ratio of (√3/2)·aM gives balanced 115 V quadrature outputs.',
          camera: 'scott-pri',
          focus: ['txM', 'txT'],
        },
        {
          id: 's3-wire-pri',
          stageId: 'three-to-two-scott',
          title: 'Wire Main (B1–M–B2) and Teaser (A1–A2)',
          why:
            'Connect va3 OUT_B & OUT_C across txM.B1–B2, OUT_A to txT.A1, and txT.A2 to center tap txM.M with secondaries open.',
          camera: 'scott-pri',
          focus: ['va3', 'txM', 'txT'],
          connectTerminals: [
            ['va3.OUT_A', 'txT.A1'],
            ['txT.A2', 'txM.M'],
            ['va3.OUT_B', 'txM.B1'],
            ['va3.OUT_C', 'txM.B2'],
          ],
        },
        {
          id: 's3-quad',
          stageId: 'three-to-two-scott',
          title: 'Check quadrature secondary voltages (115 V)',
          why:
            'With sup3 ON at 230 V, VA1A2 reads ~199.2 V and each open secondary (Va1a2 and Vb1b2) reads 115 V.',
          camera: 'scott-sec',
          focus: ['txM', 'txT', 'probe'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'probe',
            targetV: 115,
            toleranceV: 2.5,
            unit: 'V',
            targetLabel: '2φ secondary phase V',
          },
        },
        {
          id: 's3-wire-a2b2',
          stageId: 'three-to-two-scott',
          title: 'Join a2 to b2 to test 90° phase difference',
          why:
            'Shut off power and connect txT.a2 to txM.b2 so the two secondaries share a common reference terminal.',
          camera: 'scott-sec',
          focus: ['txM', 'txT'],
          connectTerminals: [['txT.a2', 'txM.b2']],
        },
        {
          id: 's3-read-diag',
          stageId: 'three-to-two-scott',
          title: 'Verify Va1b1 = √2 × 115 = 162.6 V',
          why:
            'Raise va3 to 230 V and probe between a1 and b1: the diagonal resultant is √(115² + 115²) = 162.6 V, confirming the 90° quadrature phase displacement.',
          camera: 'scott-sec',
          focus: ['va3', 'probe'],
          completionCondition: {
            kind: 'v1-target',
            controlId: 'va3.knob',
            meterId: 'probe',
            targetV: 162.6,
            toleranceV: 3.5,
            unit: 'V',
            targetLabel: 'Quadrature diagonal Va1b1',
          },
        },
      ],
    },
  ],
  answers: [
    {
      id: 'singlePhaseOutputV',
      label: 'Stage 1: Single-phase output voltage Va1c1',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 230.0',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(avgCol(rowsByStage?.['three-to-single'] ?? [], 'Va1c1', 230).toFixed(2)),
      tolerance: { rel: 0.03 },
      failHint: () => 'Check Va1c1 = |Ea + Eb - Ec| = 2·Vp ≈ 230 V.',
    },
    {
      id: 'singlePhaseMultiple',
      label: 'Stage 1: Output voltage as a multiple of secondary phase voltage (Va1c1 / Vp)',
      kind: 'number',
      placeholder: 'e.g. 2.0',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) => {
        const s1 = rowsByStage?.['three-to-single'] ?? [];
        const vout = avgCol(s1, 'Va1c1', 230);
        const vp =
          (avgCol(s1, 'Va1a4', 115) +
            avgCol(s1, 'Vb1b4', 115) +
            avgCol(s1, 'Vc1c4', 115)) /
          3;
        return Number((vout / Math.max(1, vp)).toFixed(2));
      },
      tolerance: { abs: 0.1 },
      failHint: () => 'Divide single-phase output Va1c1 (230 V) by secondary phase voltage Vp (115 V) -> 2.0.',
    },
    {
      id: 'sixPhasePhaseV',
      label: 'Stage 2: Six-phase double-star phase voltage (to neutral n)',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 57.5',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(getStage2Mean(rowsByStage, STAGE2_PHASE_KEYS, 57.5).toFixed(2)),
      tolerance: { rel: 0.03 },
      failHint: () => 'Each half-winding arm from n reads ~57.5 V.',
    },
    {
      id: 'sixPhaseLineV',
      label: 'Stage 2: Adjacent line-to-line voltage (e.g. Va1b4)',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 57.5',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(getStage2Mean(rowsByStage, STAGE2_ADJ_KEYS, 57.5).toFixed(2)),
      tolerance: { rel: 0.03 },
      failHint: () => 'Two equal 57.5 V vectors separated by 60° form an equilateral triangle: Vline = 57.5 V.',
    },
    {
      id: 'sixPhaseOppositeV',
      label: 'Stage 2: Voltage between opposite terminals a1 and a4',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 115.0',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number((getStage2Mean(rowsByStage, STAGE2_PHASE_KEYS, 57.5) * 2).toFixed(2)),
      tolerance: { rel: 0.03 },
      failHint: () => 'Opposite terminals sit 180° apart: 2 × 57.5 = 115.0 V.',
    },
    {
      id: 'sixPhaseAdjAngle',
      label: 'Stage 2: Phase angle between adjacent six-phase terminals',
      kind: 'choice',
      options: [
        { value: '60', label: '60° (360° / 6)' },
        { value: '90', label: '90°' },
        { value: '120', label: '120°' },
        { value: '180', label: '180°' },
      ],
      truth: () => '60',
      failHint: () => 'For an n = 6 polyphase system, adjacent angle is 360° / 6 = 60°.',
    },
    {
      id: 'scottVamV',
      label: 'Stage 3: Teaser primary voltage VA1A2 (VAM = √3/2 · VL)',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 199.2',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(avgCol(rowsByStage?.['three-to-two-scott'] ?? [], 'VA1A2', 199.19).toFixed(2)),
      tolerance: { rel: 0.03 },
      failHint: () => 'VAM = (√3 / 2) × 230 V ≈ 199.2 V.',
    },
    {
      id: 'scottSecPhaseV',
      label: 'Stage 3: Scott 2φ secondary phase voltages (Va1a2 and Vb1b2)',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 115.0',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) => {
        const s3 = rowsByStage?.['three-to-two-scott'] ?? [];
        const v1 = avgCol(s3, 'Va1a2', 115);
        const v2 = avgCol(s3, 'Vb1b2', 115);
        return Number(((v1 + v2) / 2).toFixed(2));
      },
      tolerance: { rel: 0.03 },
      failHint: () => 'Balanced Scott ratios 2:1 (main) and 1.732:1 (teaser) yield 115 V on each secondary.',
    },
    {
      id: 'scottVa1b1V',
      label: 'Stage 3: Diagonal voltage Va1b1 with a2 joined to b2',
      unit: 'V',
      kind: 'number',
      placeholder: 'e.g. 162.6',
      step: '0.1',
      truth: (_rows, _model, _params, rowsByStage) =>
        Number(avgCol(rowsByStage?.['three-to-two-scott'] ?? [], 'Va1b1', 162.63).toFixed(2)),
      tolerance: { rel: 0.03 },
      failHint: () => 'Orthogonal 115 V outputs combine at 90°: √2 × 115 ≈ 162.6 V.',
    },
    {
      id: 'scott400to100MainRatio',
      label: 'Sample Q3: 400 V 3φ -> 100 V 2φ Main transformer turn ratio (aM)',
      kind: 'number',
      placeholder: 'e.g. 4.0',
      step: '0.01',
      truth: () => 4.0,
      tolerance: { rel: 0.02 },
      failHint: () => 'Main ratio aM = VL / V2 = 400 / 100 = 4.',
    },
    {
      id: 'scott400to100TeaserRatio',
      label: 'Sample Q3: 400 V 3φ -> 100 V 2φ Teaser transformer turn ratio (aT)',
      kind: 'number',
      placeholder: 'e.g. 3.464',
      step: '0.001',
      truth: () => Number((4 * (Math.sqrt(3) / 2)).toFixed(3)),
      tolerance: { rel: 0.02 },
      failHint: () => 'Teaser ratio aT = (√3 / 2) × aM = 0.866 × 4 = 3.464.',
    },
    {
      id: 'scottIronLossesEqual',
      label: 'Sample Q2: Are the iron losses of identical main and teaser units equal in Scott connection?',
      kind: 'choice',
      options: [
        { value: 'yes', label: 'Yes — equal volts per turn produces equal core flux' },
        { value: 'no', label: 'No — teaser runs at 86.6% voltage so lower flux' },
      ],
      truth: () => 'yes',
      failHint: () =>
        'Teaser primary taps 86.6% of turns at 86.6% voltage (0.866·VL), so volts per turn — and thus core flux density and iron loss — are equal when operated at balanced volts/turn!',
    },
  ],
  hints: [
    'All secondary terminals carry true labels (a1–a4, b1–b4, c1–c4) and primary wires A, B, C carry across Stages 1 and 2.',
    'Keep autotransformer line voltage at 230 V during probe measurements.',
    'In Stage 3 (Scott), connect teaser A2 carefully to main center tap M so VAM = 199.2 V at 90° to VBC.',
  ],
  solutionNote:
    'Stage 1 (3φ->1φ = 230 V), Stage 2 (6φ double star = 57.5 V at 60° steps), and Stage 3 (Scott 2φ = 115 V quadrature, 162.6 V diagonal with a2–b2 joined).',
};
