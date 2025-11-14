import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Node.js環境専用のDBクライアント（スクリプト用）
// 遅延初期化（環境変数が読み込まれるまで待つ）
let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    _client = postgres(process.env.DATABASE_URL);
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>];
  }
});

// データベース接続をクローズする関数
export async function closeDb() {
  const client = _client;
  if (client) {
    _client = null;
    _db = null;
    await client.end();
  }
}
