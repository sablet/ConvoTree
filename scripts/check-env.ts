#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

console.log('DATABASE_URL:', process.env.DATABASE_URL ? '設定あり' : '設定なし');
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  console.log('ホスト:', url.hostname);
  console.log('ポート:', url.port);
  console.log('データベース:', url.pathname);
}
