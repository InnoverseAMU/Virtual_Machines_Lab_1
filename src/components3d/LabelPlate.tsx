import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

interface LabelPlateProps {
  text: string;
  subtext?: string;
  width?: number;
  height?: number;
  bg?: string;
  fg?: string;
  border?: string;
  fontSize?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function LabelPlate({
  text,
  subtext,
  width = 0.85,
  height = 0.22,
  bg = '#0f172a',
  fg = '#f8fafc',
  border = '#475569',
  fontSize = 38,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: LabelPlateProps) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.max(96, Math.round((512 * height) / width));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = border;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (subtext) {
        ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(text, canvas.width / 2, canvas.height * 0.36);
        ctx.font = `500 ${Math.round(fontSize * 0.68)}px ui-monospace, monospace`;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(subtext, canvas.width / 2, canvas.height * 0.72);
      } else {
        ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, [text, subtext, width, height, bg, fg, border, fontSize]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial map={texture} roughness={0.6} metalness={0.05} />
    </mesh>
  );
}

interface MeterDialProps {
  title: string;
  unit: string;
  maxScale: number;
  pointerRatio: number;
  width?: number;
  height?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  allowNegative?: boolean;
  overrange?: boolean;
  damaged?: boolean;
}

export function MeterDial({
  title,
  unit,
  maxScale,
  pointerRatio,
  width = 0.62,
  height = 0.42,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  allowNegative = false,
  overrange = false,
  damaged = false,
}: MeterDialProps) {
  const faceTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 340;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = overrange || damaged ? '#dc2626' : '#334155';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

      const cx = canvas.width / 2;
      const cy = canvas.height * 0.84;
      const r = canvas.width * 0.38;
      const startAngle = -Math.PI * 0.82;
      const endAngle = -Math.PI * 0.18;

      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.stroke();

      const majorTicks = 5;
      for (let i = 0; i <= 25; i++) {
        const frac = i / 25;
        const ang = startAngle + frac * (endAngle - startAngle);
        const isMajor = i % 5 === 0;
        const rInner = r - (isMajor ? 22 : 11);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
        ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = isMajor ? 4 : 2;
        ctx.stroke();

        if (isMajor) {
          const val = Math.round((i / (majorTicks * 5)) * maxScale);
          const rLabel = r - 44;
          ctx.fillStyle = '#0f172a';
          ctx.font = '700 22px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            String(val),
            cx + Math.cos(ang) * rLabel,
            cy + Math.sin(ang) * rLabel,
          );
        }
      }

      if (allowNegative) {
        // Small sub-zero tick zone to indicate reverse deflection
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle - 0.14, startAngle);
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 5;
        ctx.stroke();
      }

      ctx.fillStyle = '#1e293b';
      ctx.font = '700 26px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, cx, 56);

      ctx.fillStyle = '#475569';
      ctx.font = '700 24px ui-monospace, monospace';
      ctx.fillText(unit, cx, cy - 52);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, [title, unit, maxScale, allowNegative, overrange, damaged]);

  useEffect(() => {
    return () => {
      faceTexture.dispose();
    };
  }, [faceTexture]);

  // Arc spans -0.32*PI (right) to +0.32*PI (left) around +Y axis when looking at +Z
  const maxSweep = Math.PI * 0.32;
  const clampedRatio = Math.max(allowNegative ? -0.12 : 0, Math.min(1.05, pointerRatio));
  const needleAngle = maxSweep - clampedRatio * (maxSweep * 2);

  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={faceTexture} roughness={0.5} />
      </mesh>
      {/* Needle pivot near bottom center of dial */}
      <group position={[0, -height * 0.34, 0.008]} rotation={[0, 0, needleAngle]}>
        <mesh position={[0, height * 0.34, 0]}>
          <boxGeometry args={[0.012, height * 0.66, 0.006]} />
          <meshStandardMaterial color={damaged ? '#64748b' : '#dc2626'} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.014, 16]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
