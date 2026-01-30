import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_JSON_PATH = path.join(__dirname, '../public/assets/assets.json');
const ASSETS_BASE_DIR = path.join(__dirname, '../public/assets');
const TILESET_ASSET_DIR = path.join(ASSETS_BASE_DIR, 'Tileset Asset');
const INTERIOR_BUILDER_ASSET_DIR = path.join(ASSETS_BASE_DIR, 'interior', 'Builders Assets');

// Map Tileset Asset subfolders -> category IDs in public/assets/assets.json
const CATEGORY_MAP = {
  terrain: 'terrain',
  Floor: 'flooring',
  nature: 'nature',
  buildings: 'buildings',
  decorations: 'decorations',
  furniture: 'furniture',
  fences: 'fences',
  paths: 'paths',
  'tile object': 'tile-object',
  Stamp: 'stamp',
};

const SLUG_SAFE = /[^a-z0-9-]/g;

const toRelAssetPath = (folderName, fileName) => `assets/Tileset Asset/${folderName}/${fileName}`;
const toRelInteriorAssetPath = (subPath) => `assets/interior/Builders Assets/${subPath}`;

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[_\\s]+/g, '-')
    .replace(SLUG_SAFE, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const makeUniqueId = (baseId, existingIds) => {
  if (!existingIds.has(baseId)) return baseId;
  let i = 2;
  while (existingIds.has(`${baseId}-${i}`)) i += 1;
  return `${baseId}-${i}`;
};

const pickMovedMatch = (matches, existing) => {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const originalFolder = (() => {
    const marker = 'assets/Tileset Asset/';
    const idx = (existing.image ?? '').indexOf(marker);
    if (idx === -1) return null;
    const rest = (existing.image ?? '').slice(idx + marker.length);
    const folder = rest.split('/')[0];
    return folder || null;
  })();
  if (originalFolder) {
    const sameFolder = matches.find((match) => match.folderName === originalFolder);
    if (sameFolder) return sameFolder;
  }
  if (existing.category) {
    const sameCategory = matches.find((match) => match.categoryId === existing.category);
    if (sameCategory) return sameCategory;
  }
  return null;
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const getPngSize = (filePath) => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(24);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    if (bytesRead < header.length) {
      throw new Error('Invalid PNG: file too small');
    }
    if (!header.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error('Invalid PNG: signature mismatch');
    }
    if (header.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error('Invalid PNG: missing IHDR');
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
};

const getImageSize = async (filePath) => {
  return getPngSize(filePath);
};

const walkPngFiles = (rootDir) => {
  const results = [];
  const walk = (dir, relBase) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        results.push({ absPath: abs, relPath: rel });
      }
    }
  };
  if (fs.existsSync(rootDir)) {
    walk(rootDir, '');
  }
  return results;
};

export async function updateAssets() {
  console.log('Reading assets.json...');
  const assetsData = JSON.parse(fs.readFileSync(ASSETS_JSON_PATH, 'utf-8'));

  assetsData.objects ??= [];

  const objects = assetsData.objects;
  const existingIds = new Set(objects.map((obj) => obj.id).filter(Boolean));

  const scannedByImage = new Map();
  const scannedByBasename = new Map();

  console.log('Scanning Tileset Asset folders...');
  for (const [folderName, categoryId] of Object.entries(CATEGORY_MAP)) {
    const folderPath = path.join(TILESET_ASSET_DIR, folderName);
    if (!fs.existsSync(folderPath)) {
      console.warn(`Skipping missing folder: ${folderName}`);
      continue;
    }
    const files = fs.readdirSync(folderPath).filter((file) => file.toLowerCase().endsWith('.png'));
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        const { width, height } = await getImageSize(filePath);
        const relImage = toRelAssetPath(folderName, file);
        const info = { relImage, width, height, categoryId, folderName, fileName: file };
        scannedByImage.set(relImage, info);
        const list = scannedByBasename.get(file) ?? [];
        list.push(info);
        scannedByBasename.set(file, list);
      } catch (err) {
        console.error(`Failed to read image ${folderName}/${file}:`, err.message);
      }
    }
  }

  console.log('Scanning Interior Builder Assets...');
  // For interior "Builders Assets", we currently map folders into our existing categories.
  // Extend this map as you add more interior asset packs.
  const INTERIOR_CATEGORY_MAP = {
    tables: 'furniture',
  };
  if (fs.existsSync(INTERIOR_BUILDER_ASSET_DIR)) {
    const pngFiles = walkPngFiles(INTERIOR_BUILDER_ASSET_DIR);
    for (const { absPath, relPath } of pngFiles) {
      const topFolder = relPath.split('/')[0];
      const categoryId = (topFolder && INTERIOR_CATEGORY_MAP[topFolder]) || null;
      if (!categoryId) continue;
      try {
        const { width, height } = await getImageSize(absPath);
        const relImage = toRelInteriorAssetPath(relPath);
        const info = {
          relImage,
          width,
          height,
          categoryId,
          folderName: `interior/${topFolder}`,
          fileName: path.basename(relPath),
        };
        scannedByImage.set(relImage, info);
        const list = scannedByBasename.get(info.fileName) ?? [];
        list.push(info);
        scannedByBasename.set(info.fileName, list);
      } catch (err) {
        console.error(`Failed to read image interior/${relPath}:`, err.message);
      }
    }
  } else {
    console.warn('Skipping missing interior builder assets folder');
  }

  let updatedCount = 0;
  let movedCount = 0;
  let missingCount = 0;

  console.log('Refreshing existing entries...');
  for (const obj of objects) {
    if (!obj?.image) continue;

    let info = scannedByImage.get(obj.image);
    if (!info) {
      const base = path.basename(obj.image);
      const matches = scannedByBasename.get(base) ?? [];
      const match = pickMovedMatch(matches, obj);
      if (match) {
        console.log(`~ Moved: ${obj.id ?? base} -> ${match.relImage}`);
        obj.image = match.relImage;
        info = match;
        movedCount += 1;
      }
    }

    if (!info) {
      missingCount += 1;
      continue;
    }

    if (obj.pixelWidth !== info.width) {
      obj.pixelWidth = info.width;
      updatedCount += 1;
    }
    if (obj.pixelHeight !== info.height) {
      obj.pixelHeight = info.height;
      updatedCount += 1;
    }
    if (info.categoryId && obj.category !== info.categoryId) {
      obj.category = info.categoryId;
      updatedCount += 1;
    }
    if (!obj.anchor) {
      obj.anchor = 'bottom-left';
      updatedCount += 1;
    }
  }

  let addedCount = 0;
  console.log('Adding new files...');
  const existingImages = new Set(objects.map((obj) => obj.image).filter(Boolean));
  for (const info of scannedByImage.values()) {
    if (existingImages.has(info.relImage)) continue;

    const baseName = path.parse(info.fileName).name;
    const baseId = info.relImage.startsWith('assets/interior/')
      ? `interior-${slugify(baseName)}`
      : slugify(baseName);
    const id = makeUniqueId(baseId, existingIds);
    const name = baseName.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const newObject = {
      id,
      name,
      category: info.categoryId,
      image: info.relImage,
      pixelWidth: info.width,
      pixelHeight: info.height,
      anchor: 'bottom-left',
    };
    objects.push(newObject);
    existingIds.add(id);
    existingImages.add(info.relImage);
    addedCount += 1;
  }

  fs.writeFileSync(ASSETS_JSON_PATH, JSON.stringify(assetsData, null, 2));

  console.log('\nAssets refresh complete.');
  console.log(`- Updated fields: ${updatedCount}`);
  console.log(`- Moved paths fixed: ${movedCount}`);
  console.log(`- New assets added: ${addedCount}`);
  console.log(`- Missing assets remaining: ${missingCount}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  updateAssets().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
