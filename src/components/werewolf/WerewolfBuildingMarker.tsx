import { Container, Graphics } from '@pixi/react';
import { Graphics as PixiGraphics } from 'pixi.js';
import { useCallback } from 'react';

const MIN_RADIUS_PX = 6;
const MARKER_FILL = 0xfbbf24;
const MARKER_BORDER = 0x3f1d0b;
const MARKER_CORE = 0x7c2d12;

type Props = {
  x: number;
  y: number;
  tileDim: number;
  onSelect?: () => void;
};

export function WerewolfBuildingMarker({ x, y, tileDim, onSelect }: Props) {
  const radius = Math.max(MIN_RADIUS_PX, tileDim * 0.35);
  const draw = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.lineStyle(2, MARKER_BORDER, 0.9);
      g.beginFill(MARKER_FILL, 0.95);
      g.drawCircle(0, 0, radius);
      g.endFill();
      g.beginFill(MARKER_CORE, 0.9);
      g.drawPolygon([
        0,
        -radius * 0.9,
        radius * 0.6,
        0,
        0,
        radius * 0.9,
        -radius * 0.6,
        0,
      ]);
      g.endFill();
    },
    [radius],
  );
  const isInteractive = Boolean(onSelect);

  return (
    <Container
      x={x}
      y={y}
      interactive={isInteractive}
      pointerdown={onSelect}
      cursor={isInteractive ? 'pointer' : 'default'}
    >
      <Graphics draw={draw} />
    </Container>
  );
}
