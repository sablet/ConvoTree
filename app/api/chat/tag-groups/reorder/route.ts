import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';

export async function POST(request: Request) {
  try {
    const { orderedIds } = await request.json() as { orderedIds: string[] };
    const dataSource = new PostgresDataSource();
    await dataSource.reorderTagGroups(orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to reorder tag groups:', error);
    return NextResponse.json(
      { error: 'Failed to reorder tag groups' },
      { status: 500 }
    );
  }
}
