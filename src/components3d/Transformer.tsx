import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface TransformerProps {
  instance: ComponentInstance;
}

export function Transformer({ instance }: TransformerProps) {
  const def = getComponentDef(instance.type);
  const pPlate = String(instance.params.pPlate ?? 'PRIMARY 230 V');
  const sPlate = String(instance.params.sPlate ?? 'SECONDARY 115 V');

  return (
    <group position={instance.position}>
      {/* Mounting plinth with front terminal block */}
      <mesh position={[0, 0.16, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[1.22, 0.32, 0.94]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.25} />
      </mesh>

      {/* Laminated silicon-steel core frame */}
      <mesh position={[0, 0.62, -0.08]} castShadow receiveShadow>
        <boxGeometry args={[0.96, 0.62, 0.44]} />
        <meshStandardMaterial color="#64748b" roughness={0.45} metalness={0.65} />
      </mesh>

      {/* Primary copper winding coil (left limb) */}
      <mesh position={[-0.24, 0.62, -0.08]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.44, 24]} />
        <meshStandardMaterial color="#b45309" roughness={0.35} metalness={0.75} />
      </mesh>

      {/* Secondary copper winding coil (right limb) */}
      <mesh position={[0.24, 0.62, -0.08]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.44, 24]} />
        <meshStandardMaterial color="#d97706" roughness={0.35} metalness={0.75} />
      </mesh>

      <LabelPlate
        text="TRANSFORMER 2 kVA"
        subtext="230 V / 115 V · 50 Hz"
        width={0.94}
        height={0.18}
        fontSize={34}
        position={[0, 0.94, -0.08]}
        rotation={[-Math.PI / 2, 0, 0]}
      />

      {/* Group plates on the plinth above P1/P2 and S1/S2 */}
      <LabelPlate
        text={pPlate}
        width={0.48}
        height={0.13}
        fontSize={32}
        position={[-0.27, 0.325, 0.35]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      <LabelPlate
        text={sPlate}
        width={0.48}
        height={0.13}
        fontSize={30}
        position={[0.27, 0.325, 0.35]}
        rotation={[-Math.PI / 2, 0, 0]}
      />

      {def.terminals.map((t) => (
        <Terminal
          key={t.name}
          componentId={instance.id}
          componentLabel={instance.label}
          terminal={t}
        />
      ))}
    </group>
  );
}
