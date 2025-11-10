#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const result = await db.execute('SELECT id, name, parent_line_id FROM lines ORDER BY id');

console.log('Lines in database:');
console.log('ID | Name | Parent ID');
console.log('-'.repeat(80));

for (const row of result.rows) {
  console.log(`${row.id} | ${row.name} | ${row.parent_line_id || 'null'}`);
}

// Check for self-references
console.log('\nChecking for self-references:');
let foundSelfRef = false;
for (const row of result.rows) {
  if (row.id === row.parent_line_id) {
    console.log(`🔴 Self-reference found: ${row.id} points to itself`);
    foundSelfRef = true;
  }
}
if (!foundSelfRef) {
  console.log('✅ No self-references found');
}

// Check for circular chains
console.log('\nChecking for circular chains:');
const parentMap = new Map();
for (const row of result.rows) {
  parentMap.set(row.id, row.parent_line_id);
}

let foundCycle = false;
for (const row of result.rows) {
  const visited = new Set();
  let current = row.id;

  while (current) {
    if (visited.has(current)) {
      console.log(`🔴 CYCLE: ${Array.from(visited).join(' -> ')} -> ${current}`);
      foundCycle = true;
      break;
    }
    visited.add(current);
    current = parentMap.get(current);
  }
}

if (!foundCycle) {
  console.log('✅ No circular chains found');
}

await pool.end();
