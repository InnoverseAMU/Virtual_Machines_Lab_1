import { getComponentDef } from '../core/components';
import type { ComponentInstance, TerminalId } from '../core/types';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface Transformer3phProps {
  instance: ComponentInstance;
  terminalLabelMap?: Record<TerminalId, string>;
}

export function Transformer3ph({
  instance,
  terminalLabelMap,
}: Transformer3phProps) {
  const def = getComponentDef(instance.type);
  const hidePrimary = Boolean(instance.params.hidePrimary);
  const titlePlate = String(
    instance.params.titlePlate ?? '3-PHASE TRANSFORMER',
  );
  const ratingPlate = String(
    instance.params.ratingPlate ?? '230 V Δ / 6 × 57.5 V (12 Terminals)',
  );

  const visibleTerminals = hidePrimary
    ? def.terminals.filter((t) => t.name.startsWith('T'))
    : def.terminals;

  return (
    <group position={instance.position}>
      {/* Wide mounting base plinth */}
      <mesh position={[0, 0.16, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[1.92, 0.32, 1.02]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.25} />
      </mesh>

      {/* Three-limb laminated silicon-steel core */}
      <mesh position={[0, 0.64, -0.14]} castShadow receiveShadow>
        <boxGeometry args={[1.64, 0.68, 0.36]} />
        <meshStandardMaterial color="#64748b" roughness={0.45} metalness={0.65} />
      </mesh>

      {/* Three copper limb windings (Phases A, B, C) */}
      {[-0.52, 0, 0.52].map((x, idx) => (
        <mesh key={idx} position={[x, 0.64, -0.14]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.48, 24]} />
          <meshStandardMaterial color="#d97706" roughness={0.35} metalness={0.75} />
        </mesh>
      ))}

      {/* Front bakelite secondary terminal panel supporting T1..T12 */}
      <mesh position={[0, 0.25, 0.52]} castShadow receiveShadow>
        <boxGeometry args={[1.82, 0.72, 0.08]} />
        <meshStandardMaterial color="#0f172a" roughness={0.55} metalness={0.2} />
      </mesh>

      <LabelPlate
        text={titlePlate}
        subtext={ratingPlate}
        width={1.5}
        height={0.19}
        fontSize={30}
        position={[0, 0.99, -0.14]}
        rotation={[-Math.PI / 2, 0, 0]}
      />

      {hidePrimary && (
        <LabelPlate
          text="PRIMARY: 230 V DELTA (INTERNAL)"
          width={1.4}
          height={0.14}
          fontSize={26}
          bg="#0f172a"
          fg="#cbd5e1"
          border="#334155"
          position={[0, 0.38, 0.57]}
        />
      )}

      {visibleTerminals.map((t) => {
        const fullId: TerminalId = `${instance.id}.${t.name}`;
        const resolved = terminalLabelMap?.[fullId];
        return (
          <Terminal
            key={t.name}
            componentId={instance.id}
            componentLabel={instance.label}
            terminal={t}
            displayLabel={resolved}
          />
        );
      })}
    </group>
  );
}
