import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from './schema';

// DATABASE_URLが設定されていない場合はダミーの接続文字列を使用（ビルド時）
const connectionString = process.env.DATABASE_URL ?? 'postgresql://dummy:dummy@localhost:5432/dummy';
const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
