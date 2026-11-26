import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface CurrentTransformerProps {
  instance: ComponentInstance;
}

export function CurrentTransformer({ instance }: CurrentTransformerProps) {
  const def = getComponentDef(instance.type);
  const ratio = Number(instance.params.ratio ?? 2);
  const ratingLabel = String(instance.params.ratingPlate ?? `10 / 5 A (Ratio ${ratio})`);

  return (
    <group position={instance.position}>
      {/* Slate mounting base */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.92, 0.2, 0.78]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} metalness={0.25} />
      </mesh>

      {/* Toroidal epoxy-cast CT ring */}
      <mesh position={[0, 0.48, -0.06]} castShadow receiveShadow>
        <torusGeometry args={[0.21, 0.085, 16, 32]} />
        <meshStandardMaterial color="#0f172a" roughness={0.45} metalness={0.25} />
      </mesh>

      {/* Copper primary bar passing through CT core */}
      <mesh position={[0, 0.48, -0.06]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.44, 16]} />
        <meshStandardMaterial color="#d97706" roughness={0.3} metalness={0.85} />
      </mesh>

      {/* Front terminal block */}
      <mesh position={[0, 0.14, 0.36]} castShadow receiveShadow>
        <boxGeometry args={[0.84, 0.34, 0.12]} />
        <meshStandardMaterial color="#334155" roughness={0.6} />
      </mesh>

      <LabelPlate
        text="CURRENT TRANSFORMER"
        subtext={ratingLabel}
        width={0.78}
        height={0.16}
        fontSize={24}
        bg="#0f172a"
        fg="#f8fafc"
        border="#334155"
        position={[0, 0.22, -0.06]}
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
