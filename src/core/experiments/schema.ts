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

const ComponentInstanceSchema = z.object({
  id: z.string().min(1),
  type: ComponentTypeSchema,
  label: z.string().min(1),
  position: z.tuple([z.number(), z.number(), z.number()]),
  params: z.record(z.string(), z.union([z.number(), z.string()])),
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
    unit: z.string(),
    defaultValue: z.number(),
  }),
  z.object({
    id: z.string().min(1),
    componentId: z.string().min(1),
    kind: z.literal('selector'),
    label: z.string().min(1),
    options: z.array(z.number()).min(1),
    unit: z.string(),
    defaultValue: z.number(),
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

const LearnStepConditionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('v1-target'),
    targetV: z.number(),
    toleranceV: z.number().positive(),
  }),
  z.object({
    kind: z.literal('no-load-ack'),
    targetV: z.number(),
    toleranceV: z.number().positive(),
    lamps: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal('loaded-v1-target'),
    minLamps: z.number().int().min(1),
    targetV: z.number(),
    toleranceV: z.number().positive(),
  }),
]);

const LearnStepSchema = z.object({
  id: z.string().min(1),
  focus: z.array(z.string()),
  camera: z.enum(['overview', 'supply', 'transformer', 'meters', 'load']),
  title: z.string().min(1),
  why: z.string().min(1),
  connectTerminals: z.array(TerminalPairSchema).optional(),
  completionCondition: LearnStepConditionSchema.optional(),
});

const ColumnDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().optional(),
});

export const ExperimentDefSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  object: z.array(z.string().min(1)).min(1),
  components: z.array(ComponentInstanceSchema).min(1),
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
  learnSteps: z.array(LearnStepSchema),
  hints: z.array(z.string().min(1)),
  solutionNote: z.string().min(1),
});
