import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';
import type { TagGroup } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Omit<TagGroup, 'id'>;
    const dataSource = new PostgresDataSource();
    const id = await dataSource.createTagGroup(body);
    return NextResponse.json({ id });
  } catch (error) {
    console.error('[API] Failed to create tag group:', error);
    return NextResponse.json(
      { error: 'Failed to create tag group' },
      { status: 500 }
    );
  }
}
