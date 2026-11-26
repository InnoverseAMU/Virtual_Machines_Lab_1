export type TerminalId = string; // e.g. 'wm.M'
export type Net = TerminalId[]; // terminals that are electrically common

export interface Wire {
  id: string;
  a: TerminalId;
  b: TerminalId;
  tutorialStep?: number;
}

export type WireEndpointPair = [TerminalId, TerminalId];

export type ComponentType =
  | 'acSupply'
  | 'variac1ph'
  | 'wattmeter'
  | 'transformer1ph'
  | 'voltmeter'
  | 'ammeter'
  | 'lampLoad';

export interface TerminalDef {
  name: string;
  label: string;
  localPos: [number, number, number];
}

export type ControlValue = boolean | number | string;
export type ControlValues = Record<string, ControlValue>;

export type InternalLinksDef =
  | [string, string][]
  | ((controls: ControlValues, instance: ComponentInstance) => [string, string][]);

export interface ComponentTypeDef {
  type: ComponentType;
  terminals: TerminalDef[];
  internalLinks?: InternalLinksDef;
}

export type ComponentParamValue = number | string | boolean | number[];

export interface ComponentInstance {
  id: string;
  type: ComponentType;
  label: string;
  position: [number, number, number];
  params: Record<string, ComponentParamValue>;
}

export type ControlDef =
  | {
      id: string;
      componentId: string;
      kind: 'switch';
      label: string;
      defaultValue: boolean;
    }
  | {
      id: string;
      componentId: string;
      kind: 'knob';
      label: string;
      min: number;
      max: number;
      step: number;
      fineStep?: number;
      unit: string;
      defaultValue: number;
    }
  | {
      id: string;
      componentId: string;
      kind: 'selector';
      label: string;
      options: (number | string)[];
      unit: string;
      defaultValue: number | string;
    }
  | {
      id: string;
      componentId: string;
      kind: 'steps';
      label: string;
      min: number;
      max: number;
      defaultValue: number;
    };

export type FaultEffect =
  | 'no-reading'
  | 'reversed-reading'
  | 'wrong-reading'
  | 'danger'
  | 'short';

export interface FaultClause {
  connected?: [TerminalId, TerminalId][];
  notConnected?: [TerminalId, TerminalId][];
  anyConnected?: [TerminalId, TerminalId][];
}

export interface FaultPattern {
  id: string;
  description: string;
  match: FaultClause & {
    anyGroup?: FaultClause[];
  };
  effect: FaultEffect;
  effectTarget?: string;
}

export type CameraPreset = string;

export interface CameraPresetDef {
  id: string;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
}

export type LearnStepCondition =
  | {
      kind: 'v1-target';
      targetV: number;
      toleranceV: number;
      meterId?: string;
      controlId?: string;
      unit?: string;
      targetLabel?: string;
    }
  | {
      kind: 'no-load-ack';
      targetV: number;
      toleranceV: number;
      lamps: number;
      meterId?: string;
      loadControlId?: string;
    }
  | {
      kind: 'loaded-v1-target';
      minLamps: number;
      targetV: number;
      toleranceV: number;
      meterId?: string;
      loadControlId?: string;
    };

export interface LearnStep {
  id: string;
  stageId?: string;
  focus: string[];
  camera: CameraPreset;
  title: string;
  why: string;
  connectTerminals?: [TerminalId, TerminalId][];
  disconnectTerminals?: [TerminalId, TerminalId][];
  completionCondition?: LearnStepCondition;
}

export type ObservationCellValue = number | boolean | string | null;
export type ObservationRowValues = Record<string, ObservationCellValue>;

export interface ObservationRow {
  id: string;
  sno: number;
  values: ObservationRowValues;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [colId: string]: any;
}

export type ColumnSource =
  | { kind: 'sno' }
  | {
      kind: 'meter';
      meterId: string;
      field?: 'shownValue' | 'dial' | 'mf' | 'trueValue';
    }
  | { kind: 'control'; controlId: string }
  | {
      kind: 'derived';
      compute: (
        row: ObservationRowValues,
        params: Record<string, number>,
      ) => number | null;
    }
  | {
      kind: 'hidden';
      capture: (ctx: {
        output: PhysicsSolveOutput;
        controls: ControlValues;
        params: Record<string, number>;
      }) => ObservationCellValue;
    };

export interface ColumnDef {
  id: string;
  label: string;
  shortLabel?: string;
  unit?: string;
  source: ColumnSource;
  decimals?: number;
  displayDecimals?: number;
  hidden?: boolean;
  placeholder?: string;
}

export interface RowRule {
  id: string;
  label?: string;
  message: string | ((row: ObservationRow, params: Record<string, number>) => string);
  amber: boolean;
  highlightColumnIds?: string[];
  predicate: (row: ObservationRow, params: Record<string, number>) => boolean;
  minPassCount?: number;
  failMessage?: (
    passCount: number,
    totalCount: number,
    params: Record<string, number>,
  ) => string;
  failHint?: (
    badRows: ObservationRow[],
    params: Record<string, number>,
  ) => string;
  crossRowHint?: (
    rows: ObservationRow[],
    params: Record<string, number>,
  ) => string | null;
}

export interface PrerequisiteDef {
  id: string;
  label: string | ((rows: ObservationRow[], params: Record<string, number>) => string);
  predicate: (rows: ObservationRow[], params: Record<string, number>) => boolean;
  failMessage: string;
  failHint: string;
}

export interface ChartSeriesSpec {
  yColumn: string;
  label: string;
  color?: string;
}

export interface ChartReferenceLine {
  axis: 'x' | 'y';
  value: number;
  label: string;
  color?: string;
}

export interface ChartInputDef {
  id: string;
  label: string;
  unit?: string;
  placeholder?: string;
  step?: string;
}

export interface ChartSpec {
  id: string;
  title: string;
  subtitle?: string;
  xColumn: string;
  series: ChartSeriesSpec[];
  xLabel: string;
  yLabel: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  referenceLines?: ChartReferenceLine[];
  emptyText?: string;
  inputs?: ChartInputDef[];
  computeSeries?: (
    inputValues: Record<string, number>,
    params: Record<string, number>,
  ) => { x: number; y: number }[][];
}

export type AnswerTolerance =
  | { abs: number; rel?: undefined }
  | { rel: number; abs?: undefined }
  | { abs: number; rel: number };

export interface AnswerSpec {
  id: string;
  label: string;
  unit?: string;
  kind: 'number' | 'choice';
  options?: { value: string; label: string }[];
  placeholder?: string;
  step?: string;
  truth: (
    rows: ObservationRow[],
    model: PhysicsModel,
    params: Record<string, number>,
    rowsByStage?: Record<string, ObservationRow[]>,
  ) => number | string;
  tolerance?: AnswerTolerance;
  failHint: (
    rows: ObservationRow[],
    rowsByStage?: Record<string, ObservationRow[]>,
  ) => string;
  failMessage?: string;
}

export type NetCategoryKey =
  | 'supply'
  | 'primary'
  | 'wattmeter'
  | 'secondary'
  | 'load';

export type StageCarryOver = 'none' | 'consistent-wires';

export interface StageDef {
  id: string;
  title: string;
  summary: string;
  componentIds: string[];
  componentPositions?: Record<string, [number, number, number]>;
  componentParams?: Record<string, Record<string, ComponentParamValue>>;
  cameraPresets?: CameraPresetDef[];
  acceptedNetlists: Net[][];
  netLabels?: string[];
  netCategories?: string[];
  netCategoryKeys?: NetCategoryKey[];
  netPurposes?: Partial<Record<NetCategoryKey, string>>;
  faultPatterns: FaultPattern[];
  controls: ControlDef[];
  physicsModel: string;
  physicsParams: Record<string, number>;
  observationTable: ColumnDef[];
  rowRules: RowRule[];
  prerequisites: PrerequisiteDef[];
  charts?: ChartSpec[];
  learnSteps: LearnStep[];
  hints?: string[];
  solutionNote?: string;
  carryOver?: StageCarryOver;
}

export interface ExperimentDef {
  id: string;
  title: string;
  object: string[];
  components: ComponentInstance[];
  stages: StageDef[];
  answers: AnswerSpec[];
  charts?: ChartSpec[];
  hints: string[];
  solutionNote: string;
}

export interface ExperimentSummary {
  id: string;
  number: string;
  title: string;
  group: 'transformers' | 'induction';
  available: boolean;
}

export interface OpenNetIssue {
  netIndex: number;
  label: string;
  category: string;
  categoryKey?: NetCategoryKey;
  missingPairHint: [TerminalId, TerminalId];
}

export interface ShortIssue {
  studentNet: Net;
  mergedNetIndices: number[];
  description: string;
}

export interface ExtraConnectionIssue {
  studentNet: Net;
  extraTerminals: TerminalId[];
}

export interface ValidationResult {
  correct: boolean;
  matchedNetlistIndex: number;
  openNets: OpenNetIssue[];
  shorts: ShortIssue[];
  extras: ExtraConnectionIssue[];
  faults: FaultPattern[];
  hintLevelAvailable: number;
}

export interface BaseConnectionState {
  shorted: boolean;
  shortFaults: FaultPattern[];
  matchedFaultIds: string[];
  energised: boolean;
  loadConnected?: boolean;
  [key: string]: unknown;
}

export interface ConnectionState extends BaseConnectionState {
  shorted: boolean;
  shortFaults: FaultPattern[];
  matchedFaultIds: string[];
  variacBypassed: boolean;
  primaryEnergised: boolean;
  vpConnected: boolean;
  vsConnected: boolean;
  wmCcEnergised: boolean;
  wmPcEnergised: boolean;
  wmReversed: boolean;
  loadConnected: boolean;
  ammeterInSeries: boolean;
  voltmeterInSeriesLoad: boolean;
  voltmeterInSeriesPrimary: boolean;
}

export interface MeterGains {
  vp: number;
  vs: number;
  am: number;
  wm: number;
  [meterId: string]: number;
}

export type MeterKind = 'voltmeter' | 'ammeter' | 'wattmeter';

export interface MeterReading {
  id: string;
  label: string;
  kind: MeterKind;
  unit: string;
  range: number;
  trueValue: number;
  shownValue: number;
  ratio: number;
  pointerRatio: number;
  overrange: boolean;
  damaged: boolean;
  reversed: boolean;
  decimals?: number;
  vRange?: number;
  iRange?: number;
  divisions?: number;
  pf?: number;
  mf?: number;
  dial?: number;
  i1?: number;
  v1?: number;
  ccOverrange?: boolean;
  pcOverrange?: boolean;
}

export interface AnalogMeterReading {
  trueValue: number;
  shownValue: number;
  range: number;
  ratio: number;
  pointerRatio: number;
  overrange: boolean;
  damaged: boolean;
  reversed: boolean;
}

export interface WattmeterReading extends AnalogMeterReading {
  vRange: number;
  iRange: number;
  divisions: number;
  pf: number;
  mf: number;
  dial: number;
  i1: number;
  v1: number;
  ccOverrange: boolean;
  pcOverrange: boolean;
}

export type RuntimeSeverity = 'info' | 'warning' | 'danger';

export interface RuntimeEvent {
  id: string;
  severity: RuntimeSeverity;
  message: string;
}

export interface TransformerLoadControls {
  supplyOn: boolean;
  variacV: number;
  wmVRange: 150 | 300;
  wmIRange: 2.5 | 5 | 10;
  lamps: number;
}

export interface TransformerLoadOutput {
  V1: number;
  I1: number;
  V2: number;
  I2: number;
  Pout: number;
  Pin: number;
  Pcu: number;
  Pi: number;
  eta: number;
  mcbTripped: boolean;
  runFailed: boolean;
  meters: {
    vp: AnalogMeterReading;
    vs: AnalogMeterReading;
    am: AnalogMeterReading;
    wm: WattmeterReading;
  };
  events: RuntimeEvent[];
}

export interface PhysicsSolveInput<
  TConn extends BaseConnectionState = BaseConnectionState,
> {
  params: Record<string, number>;
  controls: ControlValues;
  connectionState: TConn;
  gains: Record<string, number>;
  seed?: number;
  options?: {
    noSag?: boolean;
    [key: string]: unknown;
  };
  components?: ComponentInstance[];
}

export interface PhysicsSolveOutput {
  meters: MeterReading[];
  events: RuntimeEvent[];
  mcbTripped: boolean;
  runFailed: boolean;
  outputs: Record<string, number>;
}

export interface NetGraphLike {
  areConnected: (a: TerminalId, b: TerminalId) => boolean;
}

export interface PhysicsModel<
  TConn extends BaseConnectionState = BaseConnectionState,
> {
  id: string;
  deriveConnectionState: (
    nets: NetGraphLike,
    controls: ControlValues,
    stageParams: Record<string, number>,
    faults?: FaultPattern[],
    seed?: number,
  ) => TConn;
  solve: (input: PhysicsSolveInput<TConn>) => PhysicsSolveOutput;
}

export interface RunAnswers {
  regulationPct: number;
  maxEffLoadPct: number;
}

export interface RunTruth {
  regulationPct: number;
  maxEffLoadPct: number;
  v2NoLoad: number;
  v2FullLoad: number;
}

export interface RunPrerequisites {
  rowCount: number;
  hasMinRows: boolean;
  hasNoLoadRow: boolean;
  hasRatedRow: boolean;
  allMet: boolean;
}

export interface RunCheckResult {
  passed: boolean;
  failedCriteria: string[];
  hints: string[];
  failedPrerequisites?: string[];
  failedRowRules?: string[];
  failedAnswers?: string[];
}
