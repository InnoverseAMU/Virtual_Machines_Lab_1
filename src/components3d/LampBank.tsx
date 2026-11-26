import { getComponentDef } from '../core/components';
import type { ComponentInstance } from '../core/types';
import { LabelPlate } from './LabelPlate';
import { Terminal } from './Terminal';

interface LampBankProps {
  instance: ComponentInstance;
  lampsLit: number;
  energised: boolean;
}

export function LampBank({ instance, lampsLit, energised }: LampBankProps) {
  const def = getComponentDef(instance.type);
  const lampIndices = Array.from({ length: 12 }, (_, i) => i);

  return (
    <group position={instance.position}>
      {/* Lamp bank chassis */}
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.42, 0.32, 0.9]} />
        <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Upright lamp mounting board */}
      <mesh position={[0, 0.56, -0.14]} castShadow receiveShadow>
        <boxGeometry args={[1.34, 0.52, 0.14]} />
        <meshStandardMaterial color="#1e293b" roughness={0.7} />
      </mesh>

      {/* 12 lamps in 2 rows of 6 */}
      {lampIndices.map((idx) => {
        const col = idx % 6;
        const row = Math.floor(idx / 6);
        const x = -0.5 + col * 0.2;
        const y = row === 0 ? 0.68 : 0.44;
        const isSwitchOn = idx < lampsLit;
        const glowing = isSwitchOn && energised;

        return (
          <group key={idx} position={[x, y, -0.02]}>
            {/* Ceramic socket */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.04, 0.045, 0.07, 14]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
            </mesh>
            {/* Glass bulb */}
            <mesh position={[0, 0, 0.07]}>
              <sphereGeometry args={[0.056, 16, 16]} />
              <meshStandardMaterial
                color={glowing ? '#fde047' : isSwitchOn ? '#fef3c7' : '#94a3b8'}
                emissive={glowing ? '#f59e0b' : '#000000'}
                emissiveIntensity={glowing ? 2.2 : 0}
                roughness={0.2}
                transparent
                opacity={glowing ? 1 : 0.72}
              />
            </mesh>
          </group>
        );
      })}

      <LabelPlate
        text="LAMP BANK LOAD"
        subtext={`12 x 200 W · ON: ${lampsLit}/12`}
        width={1.1}
        height={0.14}
        fontSize={32}
        position={[0, 0.325, 0.25]}
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
