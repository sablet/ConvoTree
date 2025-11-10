const msgs = require('../output/backups/2025-11-09T08-24-43/converted/messages.json');
const lines = require('../output/backups/2025-11-09T08-24-43/converted/lines.json');

const msgLineIds = new Set(Object.values(msgs).map(m => m.lineId));
const existingLineIds = new Set(Object.keys(lines));
const missing = [...msgLineIds].filter(id => !existingLineIds.has(id));

console.log('Total messages:', Object.keys(msgs).length);
console.log('Total lines:', Object.keys(lines).length);
console.log('Unique line IDs referenced in messages:', msgLineIds.size);
console.log('Missing line IDs:', missing.length);
if (missing.length > 0) {
  console.log('Missing IDs:', missing);
}
