import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';

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
