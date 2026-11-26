import { getComponentDef } from '../components';
import type {
  ComponentInstance,
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
 * (e.g. variac IN_N and OUT_N) before merging student wires.
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
): NetGraph {
  const uf = new UnionFind();

  for (const comp of components) {
    const def = getComponentDef(comp.type);
    for (const term of def.terminals) {
      uf.add(`${comp.id}.${term.name}`);
    }
    if (def.internalLinks) {
      for (const [t1, t2] of def.internalLinks) {
        uf.union(`${comp.id}.${t1}`, `${comp.id}.${t2}`);
      }
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
