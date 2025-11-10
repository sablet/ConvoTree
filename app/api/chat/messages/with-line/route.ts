import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';
import type { MessageInput } from '@/lib/data-source/base';

export async function POST(request: Request) {
  try {
    const { messageData, lineId, prevMessageId } = await request.json() as {
      messageData: MessageInput;
      lineId: string;
      prevMessageId?: string;
    };
    const dataSource = new PostgresDataSource();
    const id = await dataSource.createMessageWithLineUpdate(messageData, lineId, prevMessageId);
    return NextResponse.json({ id });
  } catch (error) {
    console.error('[API] Failed to create message with line update:', error);
    return NextResponse.json(
      { error: 'Failed to create message with line update' },
      { status: 500 }
    );
  }
}
