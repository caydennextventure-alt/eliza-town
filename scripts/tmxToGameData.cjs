
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const TMX_FILE_PATH = path.join(process.cwd(), 'public/assets/test/Tiled/Tilemaps/Beginning Fields.tmx');
const OUTPUT_FILE_PATH = path.join(process.cwd(), 'data/beginning_fields.js'); // Changed to .js for easier importing if needed, but project uses TS. Actually init.ts imports it. Let's make it .ts and hope initializing it as a module works, or just .js and allow JS import. `gentle.js` is .js.

async function convertTmx() {
  console.log(`Reading TMX file from: ${TMX_FILE_PATH}`);
  const xmlData = fs.readFileSync(TMX_FILE_PATH, 'utf-8');

  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(xmlData);

  const map = result.map;
  const width = parseInt(map.$.width);
  const height = parseInt(map.$.height);
  const tileWidth = parseInt(map.$.tilewidth);
  const tileHeight = parseInt(map.$.tileheight);

  console.log(`Map size: ${width}x${height}, Tile size: ${tileWidth}x${tileHeight}`);

  const layers = map.layer || [];
  const bgTiles = []; // [layer][x][y]

  for (const layer of layers) {
    const layerName = layer.$.name;
    const lWidth = parseInt(layer.$.width);
    const lHeight = parseInt(layer.$.height);
    const data = layer.data[0]._; // This is the CSV string inside <data>
    const encoding = layer.data[0].$.encoding;

    if (encoding !== 'csv') {
      console.warn(`Layer ${layerName} is not CSV encoded. Skipping.`);
      continue;
    }

    // Parse CSV
    const tileIds = data.trim().split(',').map((s) => parseInt(s.trim()));
    
    // Convert to [x][y]
    // Tiled data is row-major: index = y * width + x
    const layerGrid = [];
    
    for (let x = 0; x < lWidth; x++) {
        layerGrid[x] = [];
        for (let y = 0; y < lHeight; y++) {
            const idx = y * lWidth + x;
            let val = tileIds[idx];
            if (val === 0) val = -1;
            else val = val - 1; // 0-based index
            
            layerGrid[x][y] = val;
        }
    }
    
    bgTiles.push(layerGrid);
    console.log(`Processed layer: ${layerName}`);
  }

  const objectTiles = [];
  const emptyObjLayer = [];
  for(let x=0; x<width; x++) {
      emptyObjLayer[x] = [];
      for(let y=0; y<height; y++) {
          emptyObjLayer[x][y] = -1;
      }
  }
  objectTiles.push(emptyObjLayer);

  const animatedSprites = []; 

  const fileContent = `
export const tilesetpath = "/ai-town/assets/gentle-obj.png";
export const tiledim = ${tileWidth};
export const screenxtiles = ${width};
export const screenytiles = ${height};
export const tilesetpxw = 1440;
export const tilesetpxh = 1024;

export const bgtiles = ${JSON.stringify(bgTiles)};

export const objmap = ${JSON.stringify(objectTiles)};

export const animatedsprites = ${JSON.stringify(animatedSprites)};

export const mapwidth = ${width};
export const mapheight = ${height};
`;

  fs.writeFileSync(OUTPUT_FILE_PATH, fileContent);
  console.log(`Conversion complete! File saved to: ${OUTPUT_FILE_PATH}`);
}

convertTmx().catch(console.error);
