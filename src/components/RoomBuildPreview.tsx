import { PixiComponent } from '@pixi/react';
import * as PIXI from 'pixi.js';

export type RoomBuildPreviewItem = {
  id: string;
  image: string;
  category?: string;
  pixelWidth?: number;
  pixelHeight?: number;
  anchor?: 'top-left' | 'bottom-left' | 'center';
  scale?: number;
};

const isGroundCategory = (category?: string) =>
  category === 'terrain' || category === 'paths' || category === 'flooring' || category === 'tile-object';

const getRotatedSize = (width: number, height: number, rotation: number) =>
  rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };

const inferScale = (item: RoomBuildPreviewItem) => {
  const declared = Number(item.scale);
  if (Number.isFinite(declared) && declared > 0) return declared;
  // Interior "Builders Assets" are authored for 16px tiles; our world renders at 32px.
  if (typeof item.image === 'string') {
    const decoded = (() => {
      try {
        return decodeURI(item.image);
      } catch {
        return item.image;
      }
    })();
    if (decoded.includes('assets/interior/Builders Assets/')) return 2;
  }
  return 1;
};

type PreviewContainer = PIXI.Container & {
  __graphics?: PIXI.Graphics;
  __sprite?: PIXI.Sprite;
  __lastKey?: string;
};

export default PixiComponent('RoomBuildPreview', {
  create: () => {
    const container = new PIXI.Container() as PreviewContainer;
    const graphics = new PIXI.Graphics();
    // This overlay is purely visual; it must not intercept pointer events meant for the map.
    (container as any).eventMode = 'none';
    (graphics as any).eventMode = 'none';
    (container as any).interactive = false;
    (container as any).interactiveChildren = false;
    container.__graphics = graphics;
    container.addChild(graphics);
    return container;
  },
  applyProps: (container: PreviewContainer, _oldProps: any, props: any) => {
    const {
      tileDim,
      hoveredTileX,
      hoveredTileY,
      removeMode,
      item,
      rotation,
    }: {
      tileDim: number;
      hoveredTileX: number;
      hoveredTileY: number;
      removeMode: boolean;
      item: RoomBuildPreviewItem | null;
      rotation: number;
    } = props;

    const g = container.__graphics!;
    g.clear();

    // Always show the target tile.
    g.lineStyle(2, removeMode ? 0xff6b6b : 0x7dd3fc, 0.9);
    g.beginFill(removeMode ? 0xff6b6b : 0x7dd3fc, 0.12);
    g.drawRect(hoveredTileX * tileDim, hoveredTileY * tileDim, tileDim, tileDim);
    g.endFill();

    if (!item || removeMode) {
      if (container.__sprite) {
        container.__sprite.destroy();
        container.__sprite = undefined;
      }
      container.__lastKey = undefined;
      return;
    }

    const scale = inferScale(item);
    const pixelWidth = (Number(item.pixelWidth) || tileDim) * scale;
    const pixelHeight = (Number(item.pixelHeight) || tileDim) * scale;
    const isGround = isGroundCategory(item.category);

    const baseTileWidth = isGround ? 1 : Math.max(1, Math.ceil(pixelWidth / tileDim));
    const baseTileHeight = isGround ? 1 : Math.max(1, Math.ceil(pixelHeight / tileDim));
    const rotated = rotation === 90 || rotation === 270;
    const tileWidth = rotated ? baseTileHeight : baseTileWidth;
    const tileHeight = rotated ? baseTileWidth : baseTileHeight;

    const anchorOffset = (() => {
      if (item.anchor === 'center') return { x: Math.floor(tileWidth / 2), y: Math.floor(tileHeight / 2) };
      if (item.anchor === 'bottom-left') return { x: 0, y: tileHeight - 1 };
      return { x: 0, y: 0 };
    })();

    const startCol = hoveredTileX - anchorOffset.x;
    const startRow = hoveredTileY - anchorOffset.y;
    const boundsWidth = tileWidth * tileDim;
    const boundsHeight = tileHeight * tileDim;

    const baseWidth = isGround ? tileDim : pixelWidth;
    const baseHeight = isGround ? tileDim : pixelHeight;
    const rotatedSize = getRotatedSize(baseWidth, baseHeight, rotation);

    let offsetX = 0;
    let offsetY = 0;
    if (!isGround) {
      if (item.anchor === 'bottom-left') {
        offsetY = Math.max(0, boundsHeight - rotatedSize.height);
      } else if (item.anchor === 'center') {
        offsetX = Math.max(0, Math.round((boundsWidth - rotatedSize.width) / 2));
        offsetY = Math.max(0, Math.round((boundsHeight - rotatedSize.height) / 2));
      }
    }

    // Occupied tiles overlay.
    g.lineStyle(1, 0x7dd3fc, 0.8);
    g.beginFill(0x7dd3fc, 0.06);
    for (let dx = 0; dx < tileWidth; dx += 1) {
      for (let dy = 0; dy < tileHeight; dy += 1) {
        g.drawRect((startCol + dx) * tileDim, (startRow + dy) * tileDim, tileDim, tileDim);
      }
    }
    g.endFill();

    const spriteKey = `${item.image}|${baseWidth}|${baseHeight}|${rotation}|${startCol}|${startRow}|${offsetX}|${offsetY}`;
    if (container.__lastKey !== spriteKey) {
      if (container.__sprite) {
        container.__sprite.destroy();
        container.__sprite = undefined;
      }
      const texture = PIXI.Texture.from(item.image);
      texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
      const sprite = new PIXI.Sprite(texture);
      (sprite as any).eventMode = 'none';
      sprite.interactive = false;
      sprite.interactiveChildren = false;
      sprite.alpha = 0.65;
      sprite.width = baseWidth;
      sprite.height = baseHeight;

      const rotationInfo = (() => {
        if (rotation === 90) return { x: 0, y: baseWidth, angle: Math.PI / 2 };
        if (rotation === 180) return { x: baseWidth, y: baseHeight, angle: Math.PI };
        if (rotation === 270) return { x: baseHeight, y: 0, angle: Math.PI * 1.5 };
        return { x: 0, y: 0, angle: 0 };
      })();
      sprite.x = startCol * tileDim + offsetX + rotationInfo.x;
      sprite.y = startRow * tileDim + offsetY + rotationInfo.y;
      sprite.rotation = rotationInfo.angle;

      container.__sprite = sprite;
      container.addChild(sprite);
      container.__lastKey = spriteKey;
    } else if (container.__sprite) {
      // Keep sprite position synced in case only hovered tile changed.
      const rotationInfo = (() => {
        if (rotation === 90) return { x: 0, y: baseWidth, angle: Math.PI / 2 };
        if (rotation === 180) return { x: baseWidth, y: baseHeight, angle: Math.PI };
        if (rotation === 270) return { x: baseHeight, y: 0, angle: Math.PI * 1.5 };
        return { x: 0, y: 0, angle: 0 };
      })();
      container.__sprite.x = startCol * tileDim + offsetX + rotationInfo.x;
      container.__sprite.y = startRow * tileDim + offsetY + rotationInfo.y;
      container.__sprite.rotation = rotationInfo.angle;
    }
  },
  willUnmount: (container: PreviewContainer) => {
    try {
      container.destroy({ children: true });
    } catch {
      // ignore
    }
  },
});
