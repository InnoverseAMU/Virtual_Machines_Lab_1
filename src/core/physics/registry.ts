import type { PhysicsModel } from '../types';
import { sumpnerModel } from './models/sumpner';
import { transformerLoadModel } from './models/transformerLoad';
import { transformerOcScModel } from './models/transformerOcSc';
import { transformerParallelModel } from './models/transformerParallel';

const MODEL_REGISTRY = new Map<string, PhysicsModel>([
  [transformerLoadModel.id, transformerLoadModel as unknown as PhysicsModel],
  [transformerOcScModel.id, transformerOcScModel as unknown as PhysicsModel],
  [sumpnerModel.id, sumpnerModel as unknown as PhysicsModel],
  [transformerParallelModel.id, transformerParallelModel as unknown as PhysicsModel],
]);

export function registerPhysicsModel(model: PhysicsModel): void {
  MODEL_REGISTRY.set(model.id, model);
}

export function getPhysicsModel(id: string): PhysicsModel {
  const model = MODEL_REGISTRY.get(id);
  if (!model) {
    throw new Error(`Unsupported physics model: ${id}`);
  }
  return model;
}

export function listPhysicsModelIds(): string[] {
  return Array.from(MODEL_REGISTRY.keys());
}
