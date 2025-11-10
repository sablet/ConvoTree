import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';
import type { Line } from '@/lib/types';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as Partial<Line>;
    const dataSource = new PostgresDataSource();
    await dataSource.updateLine(params.id, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to update line:', error);
    return NextResponse.json(
      { error: 'Failed to update line' },
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
    await dataSource.deleteLine(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to delete line:', error);
    return NextResponse.json(
      { error: 'Failed to delete line' },
      { status: 500 }
    );
  }
}
