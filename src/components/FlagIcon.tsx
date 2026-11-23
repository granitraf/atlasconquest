import { useEffect, useRef } from 'react';
import { FLAG_H, FLAG_W, flagPixels, hexToRgb, type EmpireFlag } from '../game/flag';

interface Props {
  flag: EmpireFlag;
  /** Screen pixels per flag pixel. */
  scale?: number;
  /** Fill the width of the container instead of using a fixed scale. */
  fluid?: boolean;
  className?: string;
  label?: string;
}

/** The player's flag, drawn at 12x8 pixels and scaled up without smoothing. */
export function FlagIcon({ flag, scale = 4, fluid = false, className = '', label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [a, b, c] = flag.colours;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(FLAG_W, FLAG_H);
    const colours = [a, b, c].map(hexToRgb);
    flagPixels(flag.pattern).forEach((slot, i) => {
      image.data.set([...colours[slot], 255], i * 4);
    });
    ctx.putImageData(image, 0, 0);
  }, [flag.pattern, a, b, c]);
  return (
    <canvas
      ref={ref}
      width={FLAG_W}
      height={FLAG_H}
      className={`empire-flag ${fluid ? 'fluid' : ''} ${className}`}
      style={fluid ? undefined : { width: FLAG_W * scale, height: FLAG_H * scale }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
