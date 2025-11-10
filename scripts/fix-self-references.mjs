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

console.log('🔍 Finding self-referencing lines...\n');

const result = await db.execute('SELECT id, name, parent_line_id FROM lines WHERE id = parent_line_id');

if (result.rows.length === 0) {
  console.log('✅ No self-references found');
  await pool.end();
  process.exit(0);
}

console.log(`Found ${result.rows.length} self-referencing lines:`);
for (const row of result.rows) {
  console.log(`  - ${row.id} (${row.name})`);
}

console.log('\n🔧 Fixing self-references (setting parent_line_id to null)...\n');

await db.execute('UPDATE lines SET parent_line_id = NULL WHERE id = parent_line_id');

console.log(`  ✅ Fixed ${result.rows.length} self-references`);

console.log('\n✅ All self-references fixed!');

await pool.end();
