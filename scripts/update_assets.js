
import { Jimp } from 'jimp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_JSON_PATH = path.join(__dirname, '../public/assets/assets.json');
const ASSETS_BASE_DIR = path.join(__dirname, '../public/assets');
const TILESET_ASSET_DIR = path.join(ASSETS_BASE_DIR, 'Tileset Asset');

// Map folder names to category IDs in assets.json
const CATEGORY_MAP = {
    'buildings': 'buildings',
    'decorations': 'decorations',
    'furniture': 'furniture',
    'paths': 'paths', // Assuming these are props for now
    'nature': 'nature',
    'fences': 'fences',
    'tile object': 'terrain' // Tile decoration objects for terrain
};

async function updateAssets() {
    console.log("Reading assets.json...");
    const assetsData = JSON.parse(fs.readFileSync(ASSETS_JSON_PATH, 'utf-8'));
    
    // Create a set of existing IDs to avoid duplicates
    const existingIds = new Set(assetsData.objects.map(obj => obj.id));
    
    let addedCount = 0;

    for (const [folderName, categoryId] of Object.entries(CATEGORY_MAP)) {
        const folderPath = path.join(TILESET_ASSET_DIR, folderName);
        
        if (!fs.existsSync(folderPath)) {
            console.warn(`Skipping missing folder: ${folderName}`);
            continue;
        }

        console.log(`Scanning ${folderName}...`);
        const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.png'));

        for (const file of files) {
            const id = path.parse(file).name.toLowerCase().replace(/\s+/g, '-'); // Simple slugify
            
            // Check if already registered
            const alreadyExists = assetsData.objects.find(obj => 
                obj.image && obj.image.endsWith(`${folderName}/${file}`)
            );

            if (alreadyExists) {
                // Optional: Update dimensions if needed? For now, skip.
                continue;
            }

            // Load dimensions
            const filePath = path.join(folderPath, file);
            try {
                const image = await Jimp.read(filePath);
                const width = image.bitmap.width;
                const height = image.bitmap.height;

                const newObject = {
                    id: id,
                    name: path.parse(file).name.replace(/[-_]/g, ' '), // Human readable name
                    category: categoryId,
                    image: `assets/Tileset Asset/${folderName}/${file}`,
                    pixelWidth: width,
                    pixelHeight: height,
                    anchor: "bottom-left" // Default anchor
                };

                assetsData.objects.push(newObject);
                existingIds.add(id);
                addedCount++;
                console.log(`+ Added: ${newObject.name} (${width}x${height})`);

            } catch (err) {
                console.error(`Failed to read image ${file}:`, err.message);
            }
        }
    }

    if (addedCount > 0) {
        fs.writeFileSync(ASSETS_JSON_PATH, JSON.stringify(assetsData, null, 2));
        console.log(`\nSuccess! Added ${addedCount} new assets to assets.json.`);
    } else {
        console.log("\nNo new assets found to add.");
    }
}

updateAssets();
