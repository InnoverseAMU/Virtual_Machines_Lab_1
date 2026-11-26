import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface VariacProps {
  instance: ComponentInstance;
  variacV: number;
}

export function Variac({ instance, variacV }: VariacProps) {
  const def = getComponentDef(instance.type);
  // Rotate knob from +135 deg (0 V) to -135 deg (270 V)
  const knobAngle = Math.PI * 0.75 - (variacV / 270) * Math.PI * 1.5;

  return (
    <group position={instance.position}>
      {/* Base plate & front terminal apron */}
      <mesh position={[0, 0.14, 0.04]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.28, 0.94]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.25} />
      </mesh>

      {/* Cylindrical toroidal coil housing */}
      <mesh position={[0, 0.5, -0.06]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.44, 0.48, 28]} />
        <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.35} />
      </mesh>

      {/* Top dial ring */}
      <mesh position={[0, 0.745, -0.06]}>
        <cylinderGeometry args={[0.36, 0.36, 0.02, 28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} />
      </mesh>

      {/* Rotating control knob */}
      <group position={[0, 0.81, -0.06]} rotation={[0, knobAngle, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.12, 24]} />
          <meshStandardMaterial color="#020617" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.065, -0.08]}>
          <boxGeometry args={[0.03, 0.02, 0.12]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      </group>

      <LabelPlate
        text="AUTOTRANSFORMER"
        subtext={`0-270 V · ${variacV} V`}
        width={0.86}
        height={0.16}
        fontSize={34}
        position={[0, 0.285, 0.36]}
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
