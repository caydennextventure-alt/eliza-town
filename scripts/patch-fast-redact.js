const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../node_modules/@elizaos/core/dist/node/index.node.js');

let content = fs.readFileSync(filePath, 'utf8');

// Replace the validator function with a no-op version
const validatorPattern = /function validator2\(opts = \{\}\) \{[\s\S]*?return function validate\(\{ paths \}\) \{[\s\S]*?\n  \}\n\}/;
const validatorReplacement = `function validator2(opts = {}) {
    return function validate({ paths }) {
      // Patched: skip validation for Convex compatibility
    };
  }`;

content = content.replace(validatorPattern, validatorReplacement);

fs.writeFileSync(filePath, content);
console.log('Patched fast-redact validator in @elizaos/core');
