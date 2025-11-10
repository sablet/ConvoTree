import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';
import type { Message } from '@/lib/types';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as Partial<Omit<Message, 'timestamp'>> & { timestamp?: string | Date };
    const dataSource = new PostgresDataSource();
    await dataSource.updateMessage(params.id, body);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to update message:', error);
    return NextResponse.json(
      { error: 'Failed to update message' },
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
    await dataSource.deleteMessage(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to delete message:', error);
    return NextResponse.json(
      { error: 'Failed to delete message' },
      { status: 500 }
    );
  }
}
