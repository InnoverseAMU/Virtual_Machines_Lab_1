import type {
  BaseConnectionState,
  ComponentInstance,
  ControlValues,
  PhysicsSolveOutput,
  TerminalId,
  Wire,
} from '../types';
import { buildNets } from './nets';

export interface WireFlowInfo {
  /** +1 = flows wire.a -> wire.b, -1 = flows wire.b -> wire.a, 0 = no flow */
  direction: -1 | 0 | 1;
  /** Relative current magnitude in amperes (used to gently modulate drift speed) */
  currentA: number;
}

interface DirectedEdge {
  to: TerminalId;
  wireId?: string;
  wireDir?: -1 | 1;
}

function addUndirectedWireEdge(
  adj: Map<TerminalId, DirectedEdge[]>,
  wire: Wire,
) {
  const fwd = adj.get(wire.a) ?? [];
  fwd.push({ to: wire.b, wireId: wire.id, wireDir: 1 });
  adj.set(wire.a, fwd);

  const rev = adj.get(wire.b) ?? [];
  rev.push({ to: wire.a, wireId: wire.id, wireDir: -1 });
  adj.set(wire.b, rev);
}

function addDirectedInternalEdge(
  adj: Map<TerminalId, DirectedEdge[]>,
  from: TerminalId,
  to: TerminalId,
) {
  const list = adj.get(from) ?? [];
  list.push({ to });
  adj.set(from, list);
}

function addBidirectionalInternalEdge(
  adj: Map<TerminalId, DirectedEdge[]>,
  a: TerminalId,
  b: TerminalId,
) {
  addDirectedInternalEdge(adj, a, b);
  addDirectedInternalEdge(adj, b, a);
}

/**
 * Finds the shortest path of directed edges from `start` to `goal` using BFS
 * and records every traversed wire's direction (+1 or -1) into `flows`.
 */
function markShortestFlowPath(
  adj: Map<TerminalId, DirectedEdge[]>,
  start: TerminalId,
  goal: TerminalId,
  currentA: number,
  flows: Map<string, WireFlowInfo>,
  blockedEdges?: Set<string>,
): boolean {
  if (currentA <= 0.002) return false;

  const parent = new Map<
    TerminalId,
    { prev: TerminalId; edge: DirectedEdge } | null
  >();
  const queue: TerminalId[] = [start];
  parent.set(start, null);

  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === goal) {
      found = true;
      break;
    }
    const edges = adj.get(cur) ?? [];
    for (const edge of edges) {
      if (blockedEdges?.has(`${cur}->${edge.to}`)) continue;
      if (parent.has(edge.to)) continue;
      parent.set(edge.to, { prev: cur, edge });
      queue.push(edge.to);
    }
  }

  if (!found) return false;

  let cursor: TerminalId = goal;
  while (cursor !== start) {
    const step = parent.get(cursor);
    if (!step) break;
    if (step.edge.wireId && step.edge.wireDir) {
      flows.set(step.edge.wireId, {
        direction: step.edge.wireDir,
        currentA,
      });
    }
    cursor = step.prev;
  }
  return true;
}

/**
 * Computes calm, physically-consistent current flow direction for each wire on the bench.
 * Trace follows conventional current from source live through series meters/windings/loads back to neutral.
 */
export function computeWireCurrentFlows(
  components: ComponentInstance[],
  wires: Wire[],
  controls: ControlValues,
  labOutput?: PhysicsSolveOutput,
  connectionState?: BaseConnectionState,
): Map<string, WireFlowInfo> {
  const flows = new Map<string, WireFlowInfo>();

  const supplyOn = Boolean(controls['sup.switch']);
  const variacV = Number(controls['va.knob'] ?? 0);
  if (
    !supplyOn ||
    variacV <= 0 ||
    labOutput?.mcbTripped ||
    !connectionState?.energised
  ) {
    return flows;
  }

  const netGraph = buildNets(components, wires, controls);
  const compIds = new Set(components.map((c) => c.id));
  const byType = new Map(components.map((c) => [c.id, c.type]));

  // Primary & secondary magnitudes from physics outputs (with safe positive fallbacks)
  const out = labOutput?.outputs ?? {};
  const primaryI = Math.max(
    0.05,
    Math.abs(out.I1 ?? out.Io ?? out.Isc ?? out.I ?? 0.5),
  );
  const secondaryI = Math.abs(
    out.I2 ?? (out.Isc !== undefined ? Math.abs(out.Isc) * 2 : 0),
  );

  const primaryAdj = new Map<TerminalId, DirectedEdge[]>();
  const secondaryAdj = new Map<TerminalId, DirectedEdge[]>();

  for (const w of wires) {
    addUndirectedWireEdge(primaryAdj, w);
    addUndirectedWireEdge(secondaryAdj, w);
  }

  // Series conductive paths inside bench apparatus (omitting high-Z voltmeter / PC shunts)
  for (const comp of components) {
    if (comp.type === 'variac1ph') {
      // Live wiper feed and neutral return only pass current forward/return respectively
      addDirectedInternalEdge(
        primaryAdj,
        `${comp.id}.IN_P`,
        `${comp.id}.OUT_P`,
      );
      addDirectedInternalEdge(
        primaryAdj,
        `${comp.id}.OUT_N`,
        `${comp.id}.IN_N`,
      );
    } else if (comp.type === 'wattmeter') {
      addBidirectionalInternalEdge(primaryAdj, `${comp.id}.M`, `${comp.id}.L`);
      addBidirectionalInternalEdge(
        secondaryAdj,
        `${comp.id}.M`,
        `${comp.id}.L`,
      );
    } else if (comp.type === 'ammeter') {
      addBidirectionalInternalEdge(
        primaryAdj,
        `${comp.id}.IN`,
        `${comp.id}.OUT`,
      );
      addBidirectionalInternalEdge(
        secondaryAdj,
        `${comp.id}.IN`,
        `${comp.id}.OUT`,
      );
    } else if (comp.type === 'transformer1ph') {
      // Primary path can drive either P1-P2 (Exp 3.1 / 3.2 SC) or S1-S2 (Exp 3.2 OC)
      addBidirectionalInternalEdge(
        primaryAdj,
        `${comp.id}.P1`,
        `${comp.id}.P2`,
      );
      addBidirectionalInternalEdge(
        primaryAdj,
        `${comp.id}.S1`,
        `${comp.id}.S2`,
      );
    } else if (comp.type === 'lampLoad') {
      const lamps = Number(controls[`${comp.id}.lamps`] ?? controls['ld.lamps'] ?? 0);
      if (lamps > 0) {
        addBidirectionalInternalEdge(
          secondaryAdj,
          `${comp.id}.A`,
          `${comp.id}.B`,
        );
        addBidirectionalInternalEdge(
          primaryAdj,
          `${comp.id}.A`,
          `${comp.id}.B`,
        );
      }
    }
  }

  // Trace primary loop: sup.P -> ... -> sup.N (preventing direct bypass on IN_N->OUT_N or vice versa)
  const hasSup = compIds.has('sup') && byType.get('sup') === 'acSupply';
  if (hasSup) {
    // If transformer has both windings wired on distinct nets, determine which winding is fed by primary
    const blockedPrimary = new Set<string>();
    const txComp = components.find((c) => c.type === 'transformer1ph');
    if (txComp) {
      const s1OnSourceSide =
        netGraph.areConnected('va.OUT_P', `${txComp.id}.S1`) ||
        netGraph.areConnected('tx.S2', 'sup.N');
      const p1OnSourceSide =
        netGraph.areConnected('va.OUT_P', `${txComp.id}.P1`) ||
        netGraph.areConnected('wm.L', `${txComp.id}.P1`);
      if (p1OnSourceSide && !s1OnSourceSide) {
        // Primary is HV (P1/P2): don't route primary path through S1<->S2
        blockedPrimary.add(`${txComp.id}.S1->${txComp.id}.S2`);
        blockedPrimary.add(`${txComp.id}.S2->${txComp.id}.S1`);
      } else if (s1OnSourceSide && !p1OnSourceSide) {
        blockedPrimary.add(`${txComp.id}.P1->${txComp.id}.P2`);
        blockedPrimary.add(`${txComp.id}.P2->${txComp.id}.P1`);
      }
    }

    markShortestFlowPath(
      primaryAdj,
      'sup.P',
      'sup.N',
      primaryI,
      flows,
      blockedPrimary,
    );
  }

  // Trace secondary loop (e.g. tx.S1 -> am2 -> ld -> tx.S2, or tx.S1 -> tx.S2 short in Exp 3.2 SC)
  if (secondaryI > 0.005) {
    const txComp = components.find((c) => c.type === 'transformer1ph');
    if (txComp) {
      const s1: TerminalId = `${txComp.id}.S1`;
      const s2: TerminalId = `${txComp.id}.S2`;
      // Only trace secondary loop when S1 isn't wired directly to primary mains
      const lvIsPrimary =
        netGraph.areConnected(s2, 'sup.N') || netGraph.areConnected(s1, 'va.OUT_P');
      if (!lvIsPrimary) {
        markShortestFlowPath(secondaryAdj, s1, s2, secondaryI, flows);
      }
    }
  }

  return flows;
}
