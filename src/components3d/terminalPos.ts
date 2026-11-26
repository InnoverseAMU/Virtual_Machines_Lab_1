import { getTerminalDef } from '../core/components';
import type { ComponentInstance, TerminalId } from '../core/types';

export function getTerminalWorldPos(
  components: ComponentInstance[],
  terminalId: TerminalId,
): [number, number, number] | null {
  const dotIdx = terminalId.indexOf('.');
  if (dotIdx <= 0) return null;
  const compId = terminalId.slice(0, dotIdx);
  const termName = terminalId.slice(dotIdx + 1);
  const comp = components.find((c) => c.id === compId);
  if (!comp) return null;
  const termDef = getTerminalDef(comp.type, termName);
  if (!termDef) return null;
  return [
    comp.position[0] + termDef.localPos[0],
    comp.position[1] + termDef.localPos[1],
    comp.position[2] + termDef.localPos[2],
  ];
}
