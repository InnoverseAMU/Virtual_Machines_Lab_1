import { describe, expect, it } from 'vitest';
import { checkRunAnswers, evaluateColumnValue } from '../core/physics/report';
import type { ExperimentDef, ObservationRow } from '../core/types';

const mockMultiAnswerExp: ExperimentDef = {
  id: 'mock-answers',
  title: 'Mock Answers & Charts',
  object: ['Verify choice & relative tolerance answers.'],
  components: [
    { id: 'sup', type: 'acSupply', label: 'Sup', position: [0, 0, 0], params: { V: 230 } },
  ],
  stages: [
    {
      id: 's1',
      title: 'Stage 1',
      summary: 'Test',
      componentIds: ['sup'],
      acceptedNetlists: [[['sup.P', 'sup.N']]],
      faultPatterns: [],
      controls: [],
      physicsModel: 'transformerLoad',
      physicsParams: { R0: 100 },
      observationTable: [
        { id: 'sno', label: '#', source: { kind: 'sno' } },
        { id: 'v', label: 'V', unit: 'V', source: { kind: 'meter', meterId: 'vp' } },
        { id: 'i', label: 'I', unit: 'A', source: { kind: 'meter', meterId: 'am' } },
        {
          id: 'r',
          label: 'R',
          unit: 'ohm',
          source: {
            kind: 'derived',
            compute: (row) => {
              const i = Number(row.i ?? 0);
              return i > 0 ? Number(row.v ?? 0) / i : null;
            },
          },
          decimals: 1,
        },
      ],
      rowRules: [],
      prerequisites: [
        {
          id: 'at-least-2',
          label: 'At least 2 rows',
          predicate: (rows) => rows.length >= 2,
          failMessage: 'Need at least 2 rows.',
          failHint: 'Add 2 rows.',
        },
      ],
      charts: [
        {
          id: 'vi',
          title: 'V and R vs I',
          xColumn: 'i',
          series: [
            { yColumn: 'v', label: 'Voltage (V)' },
            { yColumn: 'r', label: 'Resistance (ohm)' },
          ],
          xLabel: 'Current (A)',
          yLabel: 'Value',
        },
      ],
      learnSteps: [],
    },
  ],
  answers: [
    {
      id: 'r0',
      label: 'Core resistance',
      unit: 'ohm',
      kind: 'number',
      truth: (_rows, _model, params) => params.R0,
      tolerance: { rel: 0.05 },
      failHint: () => 'Check V / I.',
    },
    {
      id: 'polarity',
      label: 'Polarity check',
      kind: 'choice',
      options: [
        { value: 'additive', label: 'Additive' },
        { value: 'subtractive', label: 'Subtractive' },
      ],
      truth: () => 'subtractive',
      failHint: () => 'Compare V3 against V1 - V2.',
    },
  ],
  hints: ['Check wiring'],
  solutionNote: 'Note',
};

describe('Generic AnswerSpec, relative tolerance, choice answers, and multi-series ChartSpec', () => {
  it('evaluates derived columns and choice/rel-tolerance answers without leaking truth', () => {
    const row1: ObservationRow = {
      id: 'r1',
      sno: 1,
      values: { sno: 1, v: 200, i: 2 },
    };
    const row2: ObservationRow = {
      id: 'r2',
      sno: 2,
      values: { sno: 2, v: 100, i: 1 },
    };

    const rCol = mockMultiAnswerExp.stages[0].observationTable.find((c) => c.id === 'r')!;
    expect(evaluateColumnValue(rCol, row1.values, {})).toBe(100);

    const pass = checkRunAnswers(
      mockMultiAnswerExp,
      { s1: [row1, row2] },
      { r0: 104, polarity: 'subtractive' },
    );
    expect(pass.passed).toBe(true);

    const fail = checkRunAnswers(
      mockMultiAnswerExp,
      { s1: [row1] },
      { r0: 120, polarity: 'additive' },
    );
    expect(fail.passed).toBe(false);
    expect(fail.failedPrerequisites).toEqual(['at-least-2']);
    expect(fail.failedAnswers).toEqual(['r0', 'polarity']);
    const text = [...fail.failedCriteria, ...fail.hints].join(' ');
    expect(text).not.toContain('100');
    expect(text).not.toContain('subtractive');
  });
});
