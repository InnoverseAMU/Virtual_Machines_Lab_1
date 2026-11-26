import type { FaultPattern, Net, TerminalId } from '../types';

export interface WattmeterFaultOptions {
  idPrefix?: string;
  ccReversedDescription?: string;
  pcOpenDescription?: string;
  pcReversedDescription?: string;
}

/**
 * Pure fault pattern factory for a 4-terminal wattmeter (M, L, V1, V2).
 * Derives mains, load, and neutral reference terminals from the canonical netlist.
 */
export function wattmeterFaults(
  wmId: string,
  canonicalNets: Net[],
  options: WattmeterFaultOptions = {},
): FaultPattern[] {
  const prefix = options.idPrefix ?? wmId;
  const mTerm = `${wmId}.M`;
  const lTerm = `${wmId}.L`;
  const v1Term = `${wmId}.V1`;
  const v2Term = `${wmId}.V2`;
  const isWmTerm = (t: TerminalId) => t.startsWith(`${wmId}.`);

  const mainsNet = canonicalNets.find((n) => n.includes(mTerm)) ?? [];
  const loadNet = canonicalNets.find((n) => n.includes(lTerm)) ?? [];
  const v2Net = canonicalNets.find((n) => n.includes(v2Term)) ?? [];

  const mainsOther = mainsNet.filter((t) => !isWmTerm(t));
  const loadOther = loadNet.filter((t) => !isWmTerm(t));
  const v2Other = v2Net.filter((t) => !isWmTerm(t));

  const mainsRef = mainsOther[0] ?? mTerm;
  const neutralRef = v2Other[0] ?? v2Term;

  const pcOpenWatch: [TerminalId, TerminalId][] = [
    ...(v2Other.length >= 2 ? [[v2Other[0], v2Other[1]] as [TerminalId, TerminalId]] : []),
    ...(mainsOther.length > 0 ? [[v1Term, mainsRef] as [TerminalId, TerminalId]] : []),
    [v1Term, mTerm],
    [v1Term, lTerm],
  ];

  const pcReversedLiveExcludes: [TerminalId, TerminalId][] = [
    ...(mainsOther.length > 0 ? [[v1Term, mainsRef] as [TerminalId, TerminalId]] : []),
    [v1Term, lTerm],
    ...(loadOther.length > 0 && loadOther[0] !== mainsRef
      ? [[v1Term, loadOther[0]] as [TerminalId, TerminalId]]
      : []),
  ];

  return [
    {
      id: `${prefix}-cc-reversed`,
      description:
        options.ccReversedDescription ??
        'The wattmeter current coil is the wrong way round. M faces the mains, L faces the load.',
      match: {
        connected: [[lTerm, mainsRef]],
        notConnected: [[mTerm, mainsRef]],
      },
      effect: 'reversed-reading',
      effectTarget: wmId,
    },
    {
      id: `${prefix}-pc-open`,
      description:
        options.pcOpenDescription ??
        'The wattmeter pressure coil is not across the supply, so it senses no voltage.',
      match: {
        notConnected: [[v2Term, neutralRef]],
        anyConnected: pcOpenWatch,
      },
      effect: 'no-reading',
      effectTarget: wmId,
    },
    {
      id: `${prefix}-pc-reversed`,
      description:
        options.pcReversedDescription ??
        'The pressure coil ends are swapped. V1 goes to the live side, V2 to neutral.',
      match: {
        anyConnected: v2Other.map((n) => [v1Term, n]),
        notConnected: pcReversedLiveExcludes,
      },
      effect: 'reversed-reading',
      effectTarget: wmId,
    },
  ];
}

export interface AmmeterShortOptions {
  id?: string;
  description?: string;
  terminals?: [string, string];
}

/**
 * Pure fault pattern factory detecting an ammeter wired directly across a source/winding.
 */
export function ammeterAcrossSource(
  amId: string,
  nodes: [TerminalId, TerminalId],
  options: AmmeterShortOptions = {},
): FaultPattern {
  const [t1, t2] = options.terminals ?? ['IN', 'OUT'];
  const termA = `${amId}.${t1}`;
  const termB = `${amId}.${t2}`;

  return {
    id: options.id ?? `${amId}-across-source`,
    description:
      options.description ??
      'The ammeter is wired across the source instead of in series with the load. An ammeter is almost a short circuit.',
    match: {
      anyGroup: [
        {
          connected: [
            [termA, nodes[0]],
            [termB, nodes[1]],
          ],
        },
        {
          connected: [
            [termB, nodes[0]],
            [termA, nodes[1]],
          ],
        },
      ],
    },
    effect: 'short',
    effectTarget: amId,
  };
}

export interface VoltmeterSeriesOptions {
  id?: string;
  description?: string;
  terminals?: [string, string];
}

/**
 * Pure fault pattern factory detecting a voltmeter wired in series along a path
 * rather than in parallel across the target nodes.
 */
export function voltmeterInSeries(
  vmId: string,
  seriesLinks: [TerminalId, TerminalId][],
  parallelReturnNodes: TerminalId[],
  options: VoltmeterSeriesOptions = {},
): FaultPattern {
  const [t1, t2] = options.terminals ?? ['A', 'B'];
  const termA = `${vmId}.${t1}`;
  const termB = `${vmId}.${t2}`;

  const anyGroup = seriesLinks.flatMap(([upstream, downstream]) => [
    {
      connected: [
        [termA, upstream],
        [termB, downstream],
      ] as [TerminalId, TerminalId][],
      notConnected: parallelReturnNodes.map(
        (n): [TerminalId, TerminalId] => [termB, n],
      ),
    },
    {
      connected: [
        [termB, upstream],
        [termA, downstream],
      ] as [TerminalId, TerminalId][],
      notConnected: parallelReturnNodes.map(
        (n): [TerminalId, TerminalId] => [termA, n],
      ),
    },
  ]);

  return {
    id: options.id ?? `${vmId}-in-series`,
    description:
      options.description ??
      'A voltmeter must be connected across what it measures, not in series with the circuit.',
    match: { anyGroup },
    effect: 'wrong-reading',
    effectTarget: vmId,
  };
}

export interface LiveNeutralShortOptions {
  id?: string;
  description?: string;
  effectTarget?: string;
}

/**
 * Pure fault pattern factory detecting any live terminal shorted to any neutral terminal.
 */
export function liveNeutralShort(
  liveNets: Net[],
  neutralNet: Net,
  options: LiveNeutralShortOptions = {},
): FaultPattern {
  const liveSet = new Set(liveNets.flat());
  const pairs: [TerminalId, TerminalId][] = [];
  const seen = new Set<string>();

  for (const liveTerm of liveSet) {
    for (const neutralTerm of neutralNet) {
      if (liveTerm === neutralTerm) continue;
      const key = `${liveTerm}|${neutralTerm}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push([liveTerm, neutralTerm]);
      }
    }
  }

  return {
    id: options.id ?? 'live-neutral-short',
    description:
      options.description ?? 'A live terminal is connected to neutral.',
    match: {
      anyConnected: pairs,
    },
    effect: 'short',
    effectTarget: options.effectTarget ?? 'sup',
  };
}
