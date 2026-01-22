
import { Jimp } from 'jimp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const CONFIG = {
  input: process.argv[2] || 'public/assets/test/spritesheet.png', // Default or arg
  outputDir: process.argv[3] || 'public/assets/sliced',
  threshold: 10,  // Alpha threshold (0-255)
  minSize: 4,     // Min width/height
  padding: 1,     // Padding pixels
};

async function sliceAssets() {
  console.log(`Loading image: ${CONFIG.input}`);
  
  try {
    const image = await Jimp.read(CONFIG.input);
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    
    console.log(`Image dimensions: ${w}x${h}`);
    
    const visited = new Uint8Array(w * h);
    const slices = [];
    
    // Helper to get pixel index
    const getIdx = (x, y) => (y * w + x);

    // Scan pixels
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = getIdx(x, y);
        if (visited[idx]) continue;

        // Check alpha (Jimp bitmap.data is a Buffer [r, g, b, a, ...])
        const alpha = image.bitmap.data[idx * 4 + 3];
        
        if (alpha > CONFIG.threshold) {
          // New object found -> Flood Fill
          let minX = x, maxX = x, minY = y, maxY = y;
          const stack = [[x, y]];
          visited[idx] = 1;
          
          while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;
            
            // Check neighbors
            const neighbors = [
               [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
            ];
            
            for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    const nIdx = getIdx(nx, ny);
                    if (!visited[nIdx]) {
                        const nAlpha = image.bitmap.data[nIdx * 4 + 3];
                        if (nAlpha > CONFIG.threshold) {
                            visited[nIdx] = 1;
                            stack.push([nx, ny]);
                        }
                    }
                }
            }
          }
          
          // Object bounds
          const width = maxX - minX + 1;
          const height = maxY - minY + 1;
          
          if (width >= CONFIG.minSize && height >= CONFIG.minSize) {
             // Apply padding
             const px = Math.max(0, minX - CONFIG.padding);
             const py = Math.max(0, minY - CONFIG.padding);
             const pw = Math.min(w - px, width + CONFIG.padding * 2);
             const ph = Math.min(h - py, height + CONFIG.padding * 2);
             
             slices.push({ x: px, y: py, w: pw, h: ph });
          }
        }
      }
    }
    
    console.log(`Found ${slices.length} assets. Saving...`);
    
    // Create output dir
    if (!fs.existsSync(CONFIG.outputDir)) {
      fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }
    
    // Save slices
    for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        const clone = image.clone();
        clone.crop({ x: slice.x, y: slice.y, w: slice.w, h: slice.h });
        
        const fileName = `asset_${i}.png`;
        const outPath = path.join(CONFIG.outputDir, fileName);
        await clone.write(outPath);
        console.log(`Saved: ${fileName}`);
    }
    
    console.log("Done!");
    
  } catch (err) {
    console.error("Error processing image:", err);
  }
}

sliceAssets();
