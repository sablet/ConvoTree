import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';

// データサイズが大きい（7MB超）ため、Next.jsのキャッシュを無効化
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const dataSource = new PostgresDataSource();
    const data = await dataSource.loadChatData();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Failed to load chat data:', error);
    return NextResponse.json(
      { error: 'Failed to load chat data' },
      { status: 500 }
    );
  }
}
