import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';
import type { Tag } from '@/lib/types';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as Partial<Tag>;
    const dataSource = new PostgresDataSource();
    await dataSource.updateTag(params.id, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to update tag:', error);
    return NextResponse.json(
      { error: 'Failed to update tag' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dataSource = new PostgresDataSource();
    await dataSource.deleteTag(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to delete tag:', error);
    return NextResponse.json(
      { error: 'Failed to delete tag' },
      { status: 500 }
    );
  }
}
