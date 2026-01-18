/**
 * Script to split 32x32folk.png into individual character sprites
 * 
 * Usage: node scripts/split-characters.mjs
 * 
 * Input:  public/assets/32x32folk.png (384 x 128 px, 8 characters)
 * Output: public/assets/characters/char-f1.png through char-f8.png (96 x 128 px each)
 */

import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const INPUT_PATH = path.join(projectRoot, 'public/assets/32x32folk.png');
const OUTPUT_DIR = path.join(projectRoot, 'public/assets/characters');

const CHAR_WIDTH = 96;   // 3 frames × 32px
const CHAR_HEIGHT = 128; // 4 rows × 32px
const GRID_COLS = 4;     // 4 characters per row
const GRID_ROWS = 2;     // 2 rows
const NUM_CHARACTERS = GRID_COLS * GRID_ROWS; // 8 total

async function main() {
  console.log('🎨 Splitting character sprite sheet...\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Created directory: ${OUTPUT_DIR}`);
  }

  // Load the source image
  const sourceImage = await loadImage(INPUT_PATH);
  console.log(`📷 Loaded: ${INPUT_PATH} (${sourceImage.width}x${sourceImage.height})`);

  const expectedWidth = CHAR_WIDTH * GRID_COLS;
  const expectedHeight = CHAR_HEIGHT * GRID_ROWS;
  if (sourceImage.width !== expectedWidth || sourceImage.height !== expectedHeight) {
    console.warn(`⚠️  Warning: Expected ${expectedWidth}x${expectedHeight}, got ${sourceImage.width}x${sourceImage.height}`);
  }

  // Split into individual characters (4 cols × 2 rows layout)
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const charIndex = row * GRID_COLS + col + 1; // 1-8
      const charName = `char-f${charIndex}.png`;
      const outputPath = path.join(OUTPUT_DIR, charName);

      const canvas = createCanvas(CHAR_WIDTH, CHAR_HEIGHT);
      const ctx = canvas.getContext('2d');

      // Extract this character's portion from the sprite sheet
      ctx.drawImage(
        sourceImage,
        col * CHAR_WIDTH, row * CHAR_HEIGHT,  // source x, y
        CHAR_WIDTH, CHAR_HEIGHT,               // source width, height
        0, 0,                                   // dest x, y
        CHAR_WIDTH, CHAR_HEIGHT                // dest width, height
      );

      // Save as PNG
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(outputPath, buffer);
      console.log(`✅ Created: ${charName}`);
    }
  }

  console.log(`\n🎉 Done! ${NUM_CHARACTERS} character sprites saved to ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
