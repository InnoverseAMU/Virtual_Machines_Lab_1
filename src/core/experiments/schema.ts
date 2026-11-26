import { z } from 'zod';

const TerminalPairSchema = z.tuple([z.string().min(1), z.string().min(1)]);

const FaultClauseSchema = z.object({
  connected: z.array(TerminalPairSchema).optional(),
  notConnected: z.array(TerminalPairSchema).optional(),
  anyConnected: z.array(TerminalPairSchema).optional(),
});

const FaultPatternSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  match: FaultClauseSchema.extend({
    anyGroup: z.array(FaultClauseSchema).optional(),
  }),
  effect: z.enum([
    'no-reading',
    'reversed-reading',
    'wrong-reading',
    'danger',
    'short',
  ]),
  effectTarget: z.string().optional(),
});

const ComponentTypeSchema = z.enum([
  'acSupply',
  'variac1ph',
  'wattmeter',
  'transformer1ph',
  'voltmeter',
  'ammeter',
  'lampLoad',
]);

const ComponentParamValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  z.array(z.number()),
]);

const ComponentInstanceSchema = z.object({
  id: z.string().min(1),
  type: ComponentTypeSchema,
  label: z.string().min(1),
  position: z.tuple([z.number(), z.number(), z.number()]),
  params: z.record(z.string(), ComponentParamValueSchema),
});

const ControlDefSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    componentId: z.string().min(1),
    kind: z.literal('switch'),
    label: z.string().min(1),
    defaultValue: z.boolean(),
  }),
  z.object({
    id: z.string().min(1),
    componentId: z.string().min(1),
    kind: z.literal('knob'),
    label: z.string().min(1),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    fineStep: z.number().positive().optional(),
    unit: z.string(),
    defaultValue: z.number(),
  }),
  z.object({
    id: z.string().min(1),
    componentId: z.string().min(1),
    kind: z.literal('selector'),
    label: z.string().min(1),
    options: z.array(z.union([z.number(), z.string()])).min(1),
    unit: z.string(),
    defaultValue: z.union([z.number(), z.string()]),
  }),
  z.object({
    id: z.string().min(1),
    componentId: z.string().min(1),
    kind: z.literal('steps'),
    label: z.string().min(1),
    min: z.number().int(),
    max: z.number().int(),
    defaultValue: z.number().int(),
  }),
]);

const CameraPresetDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  pos: z.tuple([z.number(), z.number(), z.number()]),
  target: z.tuple([z.number(), z.number(), z.number()]),
});

const LearnStepConditionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('v1-target'),
    targetV: z.number(),
    toleranceV: z.number().positive(),
    meterId: z.string().min(1).optional(),
    controlId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('no-load-ack'),
    targetV: z.number(),
    toleranceV: z.number().positive(),
    lamps: z.number().int().min(0),
    meterId: z.string().min(1).optional(),
    loadControlId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('loaded-v1-target'),
    minLamps: z.number().int().min(1),
    targetV: z.number(),
    toleranceV: z.number().positive(),
    meterId: z.string().min(1).optional(),
    loadControlId: z.string().min(1).optional(),
  }),
]);

const LearnStepSchema = z.object({
  id: z.string().min(1),
  stageId: z.string().min(1).optional(),
  focus: z.array(z.string()),
  camera: z.string().min(1),
  title: z.string().min(1),
  why: z.string().min(1),
  connectTerminals: z.array(TerminalPairSchema).optional(),
  completionCondition: LearnStepConditionSchema.optional(),
});

const ColumnSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sno') }),
  z.object({
    kind: z.literal('meter'),
    meterId: z.string().min(1),
    field: z.enum(['shownValue', 'dial', 'mf', 'trueValue']).optional(),
  }),
  z.object({ kind: z.literal('control'), controlId: z.string().min(1) }),
  z.object({ kind: z.literal('derived'), compute: z.function() }),
  z.object({ kind: z.literal('hidden'), capture: z.function() }),
]);

const ColumnDefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  shortLabel: z.string().min(1).optional(),
  unit: z.string().optional(),
  source: ColumnSourceSchema,
  decimals: z.number().int().min(0).optional(),
  displayDecimals: z.number().int().min(0).optional(),
  hidden: z.boolean().optional(),
  placeholder: z.string().optional(),
});

const RowRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  message: z.union([z.string().min(1), z.function()]),
  amber: z.boolean(),
  highlightColumnIds: z.array(z.string().min(1)).optional(),
  predicate: z.function(),
  minPassCount: z.number().int().min(0).optional(),
  failMessage: z.function().optional(),
  failHint: z.function().optional(),
  crossRowHint: z.function().optional(),
});

const PrerequisiteDefSchema = z.object({
  id: z.string().min(1),
  label: z.union([z.string().min(1), z.function()]),
  predicate: z.function(),
  failMessage: z.string().min(1),
  failHint: z.string().min(1),
});

const ChartSpecSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  xColumn: z.string().min(1),
  series: z
    .array(
      z.object({
        yColumn: z.string().min(1),
        label: z.string().min(1),
        color: z.string().optional(),
      }),
    )
    .min(1),
  xLabel: z.string().min(1),
  yLabel: z.string().min(1),
  xMin: z.number().optional(),
  xMax: z.number().optional(),
  yMin: z.number().optional(),
  yMax: z.number().optional(),
  referenceLines: z
    .array(
      z.object({
        axis: z.enum(['x', 'y']),
        value: z.number(),
        label: z.string().min(1),
        color: z.string().optional(),
      }),
    )
    .optional(),
  emptyText: z.string().optional(),
});

const AnswerToleranceSchema = z.union([
  z.object({ abs: z.number().nonnegative() }),
  z.object({ rel: z.number().nonnegative() }),
  z.object({ abs: z.number().nonnegative(), rel: z.number().nonnegative() }),
]);

const AnswerSpecSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().optional(),
  kind: z.enum(['number', 'choice']),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  placeholder: z.string().optional(),
  step: z.string().optional(),
  truth: z.function(),
  tolerance: AnswerToleranceSchema.optional(),
  failHint: z.function(),
  failMessage: z.string().min(1).optional(),
});

const StageDefSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  componentIds: z.array(z.string().min(1)).min(1),
  componentPositions: z
    .record(z.string(), z.tuple([z.number(), z.number(), z.number()]))
    .optional(),
  cameraPresets: z.array(CameraPresetDefSchema).min(1).optional(),
  acceptedNetlists: z
    .array(z.array(z.array(z.string().min(1)).min(2)).min(1))
    .min(1),
  netLabels: z.array(z.string()).optional(),
  netCategories: z.array(z.string()).optional(),
  netCategoryKeys: z
    .array(z.enum(['supply', 'primary', 'wattmeter', 'secondary', 'load']))
    .optional(),
  netPurposes: z
    .object({
      supply: z.string().min(1).optional(),
      primary: z.string().min(1).optional(),
      wattmeter: z.string().min(1).optional(),
      secondary: z.string().min(1).optional(),
      load: z.string().min(1).optional(),
    })
    .optional(),
  faultPatterns: z.array(FaultPatternSchema),
  controls: z.array(ControlDefSchema),
  physicsModel: z.string().min(1),
  physicsParams: z.record(z.string(), z.number()),
  observationTable: z.array(ColumnDefSchema),
  rowRules: z.array(RowRuleSchema),
  prerequisites: z.array(PrerequisiteDefSchema),
  charts: z.array(ChartSpecSchema).optional(),
  learnSteps: z.array(LearnStepSchema),
  hints: z.array(z.string().min(1)).optional(),
  solutionNote: z.string().min(1).optional(),
  carryOver: z.enum(['none', 'consistent-wires']).optional(),
});

export const ExperimentDefSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    object: z.array(z.string().min(1)).min(1),
    components: z.array(ComponentInstanceSchema).min(1),
    stages: z.array(StageDefSchema).min(1),
    answers: z.array(AnswerSpecSchema),
    charts: z.array(ChartSpecSchema).optional(),
    hints: z.array(z.string().min(1)),
    solutionNote: z.string().min(1),
  })
  .superRefine((exp, ctx) => {
    const compIds = new Set(exp.components.map((c) => c.id));
    const stageIds = new Set(exp.stages.map((s) => s.id));

    for (let si = 0; si < exp.stages.length; si++) {
      const stage = exp.stages[si];
      for (const cid of stage.componentIds) {
        if (!compIds.has(cid)) {
          ctx.addIssue({
            code: 'custom',
            message: `Stage ${stage.id} references unknown componentId "${cid}"`,
            path: ['stages', si, 'componentIds'],
          });
        }
      }
      if (stage.componentPositions) {
        for (const cid of Object.keys(stage.componentPositions)) {
          if (!stage.componentIds.includes(cid)) {
            ctx.addIssue({
              code: 'custom',
              message: `Stage ${stage.id} has componentPositions for "${cid}" not in componentIds`,
              path: ['stages', si, 'componentPositions'],
            });
          }
        }
      }
      for (let li = 0; li < stage.learnSteps.length; li++) {
        const step = stage.learnSteps[li];
        if (step.stageId && !stageIds.has(step.stageId)) {
          ctx.addIssue({
            code: 'custom',
            message: `LearnStep ${step.id} references unknown stageId "${step.stageId}"`,
            path: ['stages', si, 'learnSteps', li, 'stageId'],
          });
        }
      }
    }
  });
