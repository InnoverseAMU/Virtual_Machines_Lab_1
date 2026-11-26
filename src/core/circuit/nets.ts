import { getComponentDef, resolveComponentInternalLinks } from '../components';
import type {
  ComponentInstance,
  ControlValues,
  Net,
  TerminalId,
  Wire,
  WireEndpointPair,
} from '../types';

export type WireInput = Wire | WireEndpointPair;

function extractPair(wire: WireInput): WireEndpointPair {
  return Array.isArray(wire) ? wire : [wire.a, wire.b];
}

/**
 * Union-Find over terminal IDs. Always merges internal component links
 * (e.g. variac IN_N and OUT_N, or selector-plug links) before merging student wires.
 */
export class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  add(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: string): string {
    this.add(x);
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let curr = x;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;

    const rankA = this.rank.get(ra) ?? 0;
    const rankB = this.rank.get(rb) ?? 0;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }

  connected(a: string, b: string): boolean {
    return this.find(a) === this.find(b);
  }
}

export interface NetGraph {
  uf: UnionFind;
  nets: Net[];
  terminalToNetIndex: Map<TerminalId, number>;
  areConnected: (a: TerminalId, b: TerminalId) => boolean;
}

/**
 * Builds canonical student nets by merging each component's internal links
 * and all student wires. Output nets and terminals inside each net are sorted
 * so wire order never changes the result.
 */
export function buildNets(
  components: ComponentInstance[],
  wires: WireInput[],
  controls: ControlValues = {},
): NetGraph {
  const uf = new UnionFind();

  for (const comp of components) {
    const def = getComponentDef(comp.type);
    for (const term of def.terminals) {
      uf.add(`${comp.id}.${term.name}`);
    }
    for (const [t1, t2] of resolveComponentInternalLinks(def, comp, controls)) {
      uf.union(`${comp.id}.${t1}`, `${comp.id}.${t2}`);
    }
  }

  for (const wire of wires) {
    const [a, b] = extractPair(wire);
    if (a === b) continue;
    uf.union(a, b);
  }

  const groups = new Map<string, TerminalId[]>();
  for (const comp of components) {
    const def = getComponentDef(comp.type);
    for (const term of def.terminals) {
      const id = `${comp.id}.${term.name}`;
      const root = uf.find(id);
      const list = groups.get(root);
      if (list) {
        list.push(id);
      } else {
        groups.set(root, [id]);
      }
    }
  }

  for (const wire of wires) {
    const [a, b] = extractPair(wire);
    for (const id of [a, b]) {
      const root = uf.find(id);
      const list = groups.get(root);
      if (list) {
        if (!list.includes(id)) list.push(id);
      } else {
        groups.set(root, [id]);
      }
    }
  }

  const nets: Net[] = Array.from(groups.values())
    .map((net) => [...net].sort())
    .sort((x, y) => x[0].localeCompare(y[0]));

  const terminalToNetIndex = new Map<TerminalId, number>();
  nets.forEach((net, idx) => {
    for (const t of net) {
      terminalToNetIndex.set(t, idx);
    }
  });

  return {
    uf,
    nets,
    terminalToNetIndex,
    areConnected: (a: TerminalId, b: TerminalId) => {
      const na = terminalToNetIndex.get(a);
      const nb = terminalToNetIndex.get(b);
      return na !== undefined && na === nb;
    },
  };
}

export function collectInternalLinks(
  components: ComponentInstance[],
  controls: ControlValues = {},
): [TerminalId, TerminalId][] {
  const links: [TerminalId, TerminalId][] = [];
  for (const comp of components) {
    const def = getComponentDef(comp.type);
    for (const [t1, t2] of resolveComponentInternalLinks(def, comp, controls)) {
      links.push([`${comp.id}.${t1}`, `${comp.id}.${t2}`]);
    }
  }
  return links;
}

/**
 * Merges a sequence of net-group fragments into a single netlist.
 * Disjoint nets keep their exact declaration order; nets sharing any terminal
 * are merged together at the position of their first appearance.
 */
function combineNetFragments(fragments: Net[][]): Net[] {
  const rawNets = fragments.flat();
  const uf = new UnionFind();
  const orderedTerminals: TerminalId[] = [];

  for (const net of rawNets) {
    if (net.length === 0) continue;
    for (let i = 0; i < net.length; i++) {
      const t = net[i];
      if (!orderedTerminals.includes(t)) {
        orderedTerminals.push(t);
      }
      uf.add(t);
      if (i > 0) {
        uf.union(net[0], t);
      }
    }
  }

  const rootOrder: string[] = [];
  const rootMembers = new Map<string, TerminalId[]>();
  for (const t of orderedTerminals) {
    const root = uf.find(t);
    let members = rootMembers.get(root);
    if (!members) {
      members = [];
      rootMembers.set(root, members);
      rootOrder.push(root);
    }
    members.push(t);
  }

  return rootOrder.map((root) => rootMembers.get(root)!);
}

/**
 * Produces acceptedNetlists as the Cartesian product of independent variant sets.
 * Each variantSet is a list of alternative Net[] fragments (e.g. wattmeter V1 on M vs L).
 */
export function crossProduct(variantSets: Net[][][]): Net[][] {
  if (variantSets.length === 0) return [];
  if (variantSets.some((vs) => vs.length === 0)) return [];

  let combos: Net[][][] = [[]];
  for (const variantSet of variantSets) {
    const next: Net[][][] = [];
    for (const prefix of combos) {
      for (const option of variantSet) {
        next.push([...prefix, option]);
      }
    }
    combos = next;
  }

  return combos.map((fragments) => combineNetFragments(fragments));
}

function getWorldPosMap(
  components: ComponentInstance[],
): Map<TerminalId, [number, number, number]> {
  const map = new Map<TerminalId, [number, number, number]>();
  for (const comp of components) {
    for (const t of getComponentDef(comp.type).terminals) {
      map.set(`${comp.id}.${t.name}`, [
        comp.position[0] + t.localPos[0],
        comp.position[1] + t.localPos[1],
        comp.position[2] + t.localPos[2],
      ]);
    }
  }
  return map;
}

function distSq(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function orderNetByDistance(
  net: Net,
  posMap: Map<TerminalId, [number, number, number]>,
): TerminalId[] {
  if (net.length <= 2 || posMap.size === 0) return [...net];
  const remaining = [...net];
  remaining.sort((a, b) => {
    const pa = posMap.get(a);
    const pb = posMap.get(b);
    if (!pa || !pb) return a.localeCompare(b);
    return pa[0] - pb[0] || pa[2] - pb[2];
  });

  const ordered: TerminalId[] = [remaining.shift()!];
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    const lastPos = posMap.get(last);
    let bestIdx = 0;
    if (lastPos) {
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const p = posMap.get(remaining[i]);
        if (!p) continue;
        const d = distSq(lastPos, p);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

/**
 * Returns a minimal chain of terminal pairs that realises the given netlist,
 * seeded with component internal links so already-common terminals are skipped.
 * When components are provided, terminals in each net are ordered by 3D distance
 * so wires stay short and avoid crossing the bench.
 */
export function wiresFromNetlist(
  netlist: Net[],
  internalLinks: [TerminalId, TerminalId][],
  components?: ComponentInstance[],
): WireEndpointPair[] {
  const uf = new UnionFind();
  for (const [a, b] of internalLinks) {
    uf.union(a, b);
  }

  const posMap = components ? getWorldPosMap(components) : new Map();
  const pairs: WireEndpointPair[] = [];

  for (const net of netlist) {
    if (net.length < 2) continue;
    const ordered = orderNetByDistance(net, posMap);
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1];
      const b = ordered[i];
      if (!uf.connected(a, b)) {
        pairs.push([a, b]);
        uf.union(a, b);
      }
    }
  }

  return pairs;
}
