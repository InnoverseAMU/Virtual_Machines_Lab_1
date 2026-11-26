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

export interface ComponentTypeDef {
  type: ComponentType;
  terminals: TerminalDef[];
  internalLinks?: [string, string][];
}

export interface ComponentInstance {
  id: string;
  type: ComponentType;
  label: string;
  position: [number, number, number];
  params: Record<string, number | string>;
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
      unit: string;
      defaultValue: number;
    }
  | {
      id: string;
      componentId: string;
      kind: 'selector';
      label: string;
      options: number[];
      unit: string;
      defaultValue: number;
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

export type CameraPreset =
  | 'overview'
  | 'supply'
  | 'transformer'
  | 'meters'
  | 'load';

export type LearnStepCondition =
  | {
      kind: 'v1-target';
      targetV: number;
      toleranceV: number;
    }
  | {
      kind: 'no-load-ack';
      targetV: number;
      toleranceV: number;
      lamps: number;
    }
  | {
      kind: 'loaded-v1-target';
      minLamps: number;
      targetV: number;
      toleranceV: number;
    };

export interface LearnStep {
  id: string;
  focus: string[];
  camera: CameraPreset;
  title: string;
  why: string;
  connectTerminals?: [TerminalId, TerminalId][];
  completionCondition?: LearnStepCondition;
}

export interface ColumnDef {
  key: string;
  label: string;
  unit?: string;
}

export type NetCategoryKey =
  | 'supply'
  | 'primary'
  | 'wattmeter'
  | 'secondary'
  | 'load';

export interface ExperimentDef {
  id: string;
  title: string;
  object: string[];
  components: ComponentInstance[];
  acceptedNetlists: Net[][];
  netLabels?: string[];
  netCategories?: string[];
  netCategoryKeys?: NetCategoryKey[];
  faultPatterns: FaultPattern[];
  controls: ControlDef[];
  physicsModel: string;
  physicsParams: Record<string, number>;
  observationTable: ColumnDef[];
  learnSteps: LearnStep[];
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

export interface ConnectionState {
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
