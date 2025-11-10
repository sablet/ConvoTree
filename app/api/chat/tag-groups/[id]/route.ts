import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';
import type { TagGroup } from '@/lib/types';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as Partial<TagGroup>;
    const dataSource = new PostgresDataSource();
    await dataSource.updateTagGroup(params.id, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to update tag group:', error);
    return NextResponse.json(
      { error: 'Failed to update tag group' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { tagHandlingOption } = await request.json() as { tagHandlingOption?: 'delete' | 'unlink' };
    const dataSource = new PostgresDataSource();
    await dataSource.deleteTagGroup(params.id, tagHandlingOption);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to delete tag group:', error);
    return NextResponse.json(
      { error: 'Failed to delete tag group' },
      { status: 500 }
    );
  }
}
