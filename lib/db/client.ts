import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// DATABASE_URLが設定されていない場合はダミーの接続文字列を使用（ビルド時）
const connectionString = process.env.DATABASE_URL ?? 'postgresql://dummy:dummy@localhost:5432/dummy';

// HTTPベースの接続を使用（WebSocketを使わないため、wsパッケージのバンドリング問題を回避）
// fetchOptions で cache: 'no-store' を指定してNext.jsのキャッシュを無効化
const sql = neon(connectionString, {
  fetchOptions: {
    cache: 'no-store',
  },
});

export const db = drizzle(sql, { schema });
