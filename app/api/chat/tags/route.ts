import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';
import type { Tag } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Omit<Tag, 'id'>;
    const dataSource = new PostgresDataSource();
    const id = await dataSource.createTag(body);
    return NextResponse.json({ id });
  } catch (error) {
    console.error('[API] Failed to create tag:', error);
    return NextResponse.json(
      { error: 'Failed to create tag' },
      { status: 500 }
    );
  }
}
