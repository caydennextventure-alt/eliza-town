const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TILESET_PATH = path.join(__dirname, 'public/assets/Tileset Asset');
const OUTPUT_PATH = path.join(__dirname, 'public/assets/assets.json');

const categories = ['terrain', 'nature', 'buildings', 'decorations', 'furniture', 'fences', 'paths'];

const categoryNames = {
  terrain: '地形',
  nature: '自然',
  buildings: '建筑',
  decorations: '装饰',
  furniture: '家具',
  fences: '围栏',
  paths: '道路'
};

function getImageDimensions(filePath) {
  try {
    const result = execSync(`sips -g pixelWidth -g pixelHeight "${filePath}"`, { encoding: 'utf8' });
    const widthMatch = result.match(/pixelWidth:\s*(\d+)/);
    const heightMatch = result.match(/pixelHeight:\s*(\d+)/);
    return {
      width: widthMatch ? parseInt(widthMatch[1]) : 32,
      height: heightMatch ? parseInt(heightMatch[1]) : 32
    };
  } catch (e) {
    return { width: 32, height: 32 };
  }
}

function fileToId(filename) {
  return filename
    .replace('.png', '')
    .replace(/[_\s]+/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function fileToName(filename) {
  return filename
    .replace('.png', '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const assetsJson = {
  version: 2,
  description: "Assets loaded from Tileset Asset folder, organized by category",
  basePath: "assets/Tileset Asset",
  categories: {},
  objects: []
};

// Build categories
for (const cat of categories) {
  assetsJson.categories[cat] = {
    name: categoryNames[cat],
    folder: cat
  };
}

// Scan each category folder
for (const cat of categories) {
  const folderPath = path.join(TILESET_PATH, cat);
  if (!fs.existsSync(folderPath)) continue;
  
  const files = fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.png') && !f.startsWith('.'))
    .sort();
  
  console.log(`Processing ${cat}: ${files.length} files`);
  
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const dims = getImageDimensions(filePath);
    
    assetsJson.objects.push({
      id: fileToId(file),
      name: fileToName(file),
      category: cat,
      image: `assets/Tileset Asset/${cat}/${file}`,
      pixelWidth: dims.width,
      pixelHeight: dims.height
    });
  }
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(assetsJson, null, 2));
console.log(`\nGenerated ${assetsJson.objects.length} objects total`);
console.log(`Saved to: ${OUTPUT_PATH}`);
