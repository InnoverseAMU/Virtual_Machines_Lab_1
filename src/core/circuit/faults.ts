import type { NetGraph } from './nets';
import type {
  ConnectionState,
  FaultClause,
  FaultPattern,
  TerminalId,
} from '../types';

function matchesClause(clause: FaultClause, graph: NetGraph): boolean {
  if (clause.connected) {
    for (const [a, b] of clause.connected) {
      if (!graph.areConnected(a, b)) return false;
    }
  }
  if (clause.notConnected) {
    for (const [a, b] of clause.notConnected) {
      if (graph.areConnected(a, b)) return false;
    }
  }
  if (clause.anyConnected && clause.anyConnected.length > 0) {
    const anyHit = clause.anyConnected.some(([a, b]) => graph.areConnected(a, b));
    if (!anyHit) return false;
  }
  return true;
}

export function matchFaultPatterns(
  faultPatterns: FaultPattern[],
  graph: NetGraph,
): FaultPattern[] {
  return faultPatterns.filter((pattern) => {
    if (!matchesClause(pattern.match, graph)) return false;
    if (pattern.match.anyGroup && pattern.match.anyGroup.length > 0) {
      return pattern.match.anyGroup.some((group) => matchesClause(group, graph));
    }
    return true;
  });
}

function anyConnectedTo(
  graph: NetGraph,
  target: TerminalId,
  candidates: TerminalId[],
): boolean {
  return candidates.some((c) => graph.areConnected(target, c));
}

function pairAcross(
  graph: NetGraph,
  t1: TerminalId,
  t2: TerminalId,
  sideA: TerminalId[],
  sideB: TerminalId[],
): boolean {
  const fwd = anyConnectedTo(graph, t1, sideA) && anyConnectedTo(graph, t2, sideB);
  const rev = anyConnectedTo(graph, t2, sideA) && anyConnectedTo(graph, t1, sideB);
  return fwd || rev;
}

/**
 * Derives the electrical ConnectionState from student nets and matched faults
 * so the physics model behaves like a real bench for both correct and faulty wirings.
 */
export function deriveConnectionState(
  graph: NetGraph,
  faults: FaultPattern[],
  supplyOn: boolean,
): ConnectionState {
  const faultIds = faults.map((f) => f.id);
  const shortFaults = faults.filter((f) => f.effect === 'short');
  const shorted = shortFaults.length > 0;

  const variacBypassed =
    graph.areConnected('sup.P', 'va.OUT_P') ||
    graph.areConnected('sup.P', 'wm.M') ||
    graph.areConnected('sup.P', 'wm.L');

  const supConnectedToVariac =
    graph.areConnected('sup.P', 'va.IN_P') &&
    graph.areConnected('sup.N', 'va.IN_N');

  const liveSourceTerminals: TerminalId[] = variacBypassed
    ? ['sup.P']
    : ['va.OUT_P'];

  const ccForward =
    anyConnectedTo(graph, 'wm.M', liveSourceTerminals) &&
    graph.areConnected('wm.L', 'tx.P1');

  const ccReversed =
    anyConnectedTo(graph, 'wm.L', liveSourceTerminals) &&
    graph.areConnected('wm.M', 'tx.P1');

  const primaryDirectToTx = anyConnectedTo(graph, 'tx.P1', liveSourceTerminals);
  const primaryNeutralReturn = graph.areConnected('tx.P2', 'sup.N');

  const voltmeterInSeriesPrimary = faultIds.includes('voltmeter-in-series-primary');
  const voltmeterInSeriesLoad = faultIds.includes('voltmeter-in-series-load');

  const primaryPathClosed =
    (supConnectedToVariac || variacBypassed) &&
    primaryNeutralReturn &&
    (ccForward || ccReversed || primaryDirectToTx) &&
    !voltmeterInSeriesPrimary;

  const primaryEnergised = supplyOn && !shorted && primaryPathClosed;

  const neutralSide: TerminalId[] = ['sup.N', 'va.IN_N', 'va.OUT_N', 'tx.P2'];
  const primaryLiveSide: TerminalId[] = [
    'va.OUT_P',
    'wm.M',
    'wm.L',
    'tx.P1',
    ...(variacBypassed ? ['sup.P'] : []),
  ];

  // Wattmeter pressure coil sees voltage when one side is on primary live and the other on neutral
  const pcForward =
    anyConnectedTo(graph, 'wm.V1', primaryLiveSide) &&
    anyConnectedTo(graph, 'wm.V2', neutralSide);
  const pcReversed =
    anyConnectedTo(graph, 'wm.V1', neutralSide) &&
    anyConnectedTo(graph, 'wm.V2', primaryLiveSide);

  const wmPcEnergised =
    supplyOn &&
    !shorted &&
    (supConnectedToVariac || variacBypassed) &&
    (pcForward || pcReversed);

  const wmCcEnergised = primaryEnergised && (ccForward || ccReversed);
  const wmReversed = ccReversed !== pcReversed;

  // Primary voltmeter reads V1 when across primary live & neutral, or when stuck in series on primary
  const vpAcrossPrimary = pairAcross(
    graph,
    'vp.A',
    'vp.B',
    primaryLiveSide,
    neutralSide,
  );
  const vpConnected =
    supplyOn &&
    !shorted &&
    (supConnectedToVariac || variacBypassed) &&
    (vpAcrossPrimary || (voltmeterInSeriesPrimary && primaryNeutralReturn));

  // Secondary load path: tx.S1 -> am -> ld.A and tx.S2 -> ld.B (or am on return leg)
  const amForwardSide1 =
    graph.areConnected('tx.S1', 'am.IN') && graph.areConnected('am.OUT', 'ld.A');
  const amReverseSide1 =
    graph.areConnected('tx.S1', 'am.OUT') && graph.areConnected('am.IN', 'ld.A');
  const amSide2Forward =
    graph.areConnected('tx.S2', 'am.IN') && graph.areConnected('am.OUT', 'ld.B');
  const amSide2Reverse =
    graph.areConnected('tx.S2', 'am.OUT') && graph.areConnected('am.IN', 'ld.B');

  const ammeterInSeries =
    ((amForwardSide1 || amReverseSide1) && graph.areConnected('tx.S2', 'ld.B')) ||
    ((amSide2Forward || amSide2Reverse) && graph.areConnected('tx.S1', 'ld.A'));

  const directLoad =
    graph.areConnected('tx.S1', 'ld.A') && graph.areConnected('tx.S2', 'ld.B');

  const loadConnected =
    primaryEnergised &&
    !voltmeterInSeriesLoad &&
    (ammeterInSeries || directLoad);

  const secondarySide1: TerminalId[] = ['tx.S1'];
  const secondarySide2: TerminalId[] = ['tx.S2'];
  const vsAcrossTx = pairAcross(
    graph,
    'vs.A',
    'vs.B',
    secondarySide1,
    secondarySide2,
  );
  const vsAcrossLoad =
    loadConnected &&
    pairAcross(graph, 'vs.A', 'vs.B', ['ld.A', 'am.OUT'], ['ld.B']);
  const vsConnected =
    primaryEnergised && (vsAcrossTx || vsAcrossLoad || voltmeterInSeriesLoad);

  return {
    shorted,
    shortFaults,
    matchedFaultIds: faultIds,
    variacBypassed,
    primaryEnergised,
    vpConnected,
    vsConnected,
    wmCcEnergised,
    wmPcEnergised,
    wmReversed,
    loadConnected,
    ammeterInSeries,
    voltmeterInSeriesLoad,
    voltmeterInSeriesPrimary,
  };
}
