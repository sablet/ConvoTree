import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : undefined;

  const dataSource = new PostgresDataSource();
  const data = await dataSource.loadChatData(since);

  console.log(`[API] Loaded data${since ? ` since ${since.toISOString()}` : ' (full)'}`);
  return NextResponse.json(data);
}
