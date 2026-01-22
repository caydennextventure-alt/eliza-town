const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../node_modules/@elizaos/core/dist/node/index.node.js');

// Check if file exists
if (!fs.existsSync(filePath)) {
  console.log('Skipping patch: @elizaos/core not found');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');

// Check if already patched
if (content.includes('// Patched for Convex')) {
  console.log('fast-redact already patched');
  process.exit(0);
}

// Patch the fast-redact validator to skip validation
// The validator uses Function() constructor which fails in Convex's bundler
const pattern = /return function validate\(\{ paths \}\) \{/g;
const replacement = 'return function validate({ paths }) { return; // Patched for Convex';

if (pattern.test(content)) {
  content = content.replace(pattern, replacement);
  fs.writeFileSync(filePath, content);
  console.log('Patched fast-redact validator in @elizaos/core');
} else {
  console.log('Pattern not found - @elizaos/core may have updated');
}
