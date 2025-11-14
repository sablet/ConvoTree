#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { db, closeDb } from '../lib/db/client-node';
import { sql } from 'drizzle-orm';

async function testConnection() {
  console.log('🔍 データベース接続テスト\n');

  try {
    // 簡単なクエリでテスト
    const result = await db.execute(sql`SELECT 1 as test`);
    console.log('✅ データベース接続成功');
    console.log('テスト結果:', result);

    // テーブル一覧を取得
    const tables = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    console.log('\n📋 テーブル一覧:');
    console.log(tables);

  } catch (error) {
    console.error('❌ データベース接続エラー:', error);
    process.exit(1);
  }
}

testConnection()
  .catch(console.error)
  .finally(async () => {
    await closeDb();
  });
