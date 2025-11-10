import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';
import type { MessageInput } from '@/lib/data-source/base';

export async function POST(request: Request) {
  try {
    const body = await request.json() as MessageInput;
    const dataSource = new PostgresDataSource();
    const id = await dataSource.createMessage(body);
    return NextResponse.json({ id });
  } catch (error) {
    console.error('[API] Failed to create message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}
