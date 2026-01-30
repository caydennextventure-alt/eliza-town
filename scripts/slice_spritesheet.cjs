/**
 * Smart Spritesheet Slicer
 * Detects individual sprites by finding non-transparent regions
 * and slices them into separate PNG files.
 */

const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

// Configuration
const INPUT_FILE = process.argv[2];
const OUTPUT_DIR = process.argv[3] || './sliced';
const MIN_SPRITE_SIZE = 8; // Minimum sprite dimension
const PADDING = 1; // Padding around detected sprites

if (!INPUT_FILE) {
  console.log('Usage: node slice_spritesheet.js <input.png> [output_dir]');
  console.log('Example: node slice_spritesheet.js tables.png ./sliced_tables');
  process.exit(1);
}

async function sliceSpritesheet() {
  console.log(`Reading: ${INPUT_FILE}`);
  const img = await Jimp.read(INPUT_FILE);
  const { width, height } = img;
  console.log(`Image size: ${width}x${height}`);

  // Create a 2D array to track which pixels have been visited
  const visited = Array(height).fill(null).map(() => Array(width).fill(false));

  // Find all sprites using flood-fill algorithm
  const sprites = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (visited[y][x]) continue;

      const pixel = img.getPixelColor(x, y);
      const alpha = pixel & 0xFF;

      if (alpha > 10) { // Non-transparent pixel found
        // Flood fill to find all connected non-transparent pixels
        const bounds = { minX: x, minY: y, maxX: x, maxY: y };
        const stack = [[x, y]];

        while (stack.length > 0) {
          const [cx, cy] = stack.pop();
          if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
          if (visited[cy][cx]) continue;

          const p = img.getPixelColor(cx, cy);
          const a = p & 0xFF;
          if (a <= 10) continue; // Transparent

          visited[cy][cx] = true;
          bounds.minX = Math.min(bounds.minX, cx);
          bounds.minY = Math.min(bounds.minY, cy);
          bounds.maxX = Math.max(bounds.maxX, cx);
          bounds.maxY = Math.max(bounds.maxY, cy);

          // Check 4-connected neighbors (can change to 8 for diagonal)
          stack.push([cx + 1, cy]);
          stack.push([cx - 1, cy]);
          stack.push([cx, cy + 1]);
          stack.push([cx, cy - 1]);
        }

        // Calculate sprite dimensions
        const spriteWidth = bounds.maxX - bounds.minX + 1;
        const spriteHeight = bounds.maxY - bounds.minY + 1;

        // Filter out too-small sprites (likely noise)
        if (spriteWidth >= MIN_SPRITE_SIZE && spriteHeight >= MIN_SPRITE_SIZE) {
          sprites.push({
            x: Math.max(0, bounds.minX - PADDING),
            y: Math.max(0, bounds.minY - PADDING),
            width: Math.min(width - bounds.minX + PADDING * 2, spriteWidth + PADDING * 2),
            height: Math.min(height - bounds.minY + PADDING * 2, spriteHeight + PADDING * 2),
          });
        }
      } else {
        visited[y][x] = true;
      }
    }
  }

  console.log(`Found ${sprites.length} sprites`);

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Sort sprites by position (top to bottom, left to right)
  sprites.sort((a, b) => {
    const rowA = Math.floor(a.y / 32);
    const rowB = Math.floor(b.y / 32);
    if (rowA !== rowB) return rowA - rowB;
    return a.x - b.x;
  });

  // Extract and save each sprite
  const baseName = path.basename(INPUT_FILE, path.extname(INPUT_FILE));
  const manifest = [];

  for (let i = 0; i < sprites.length; i++) {
    const sprite = sprites[i];
    const outputName = `${baseName}_${String(i + 1).padStart(3, '0')}.png`;
    const outputPath = path.join(OUTPUT_DIR, outputName);

    // Ensure bounds don't exceed image dimensions
    const cropX = Math.max(0, Math.min(sprite.x, width - 1));
    const cropY = Math.max(0, Math.min(sprite.y, height - 1));
    const cropW = Math.min(sprite.width, width - cropX);
    const cropH = Math.min(sprite.height, height - cropY);

    if (cropW < MIN_SPRITE_SIZE || cropH < MIN_SPRITE_SIZE) {
      console.log(`  Skipped: ${outputName} (too small after bounds check)`);
      continue;
    }

    // Crop the sprite
    const cropped = img.clone().crop({
      x: cropX,
      y: cropY,
      w: cropW,
      h: cropH,
    });

    await cropped.write(outputPath);
    console.log(`  Saved: ${outputName} (${sprite.width}x${sprite.height})`);

    manifest.push({
      id: `${baseName}-${i + 1}`,
      name: `${baseName} ${i + 1}`,
      image: outputPath,
      pixelWidth: sprite.width,
      pixelHeight: sprite.height,
    });
  }

  // Save manifest
  const manifestPath = path.join(OUTPUT_DIR, `${baseName}_manifest.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest saved: ${manifestPath}`);
  console.log(`\nDone! Extracted ${sprites.length} sprites.`);
}

sliceSpritesheet().catch(console.error);
