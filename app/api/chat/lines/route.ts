import { NextResponse } from 'next/server';
import { PostgresDataSource } from '@/lib/data-source/postgres';
import type { Line } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Omit<Line, 'id'>;
    const dataSource = new PostgresDataSource();
    const id = await dataSource.createLine(body);
    return NextResponse.json({ id });
  } catch (error) {
    console.error('[API] Failed to create line:', error);
    return NextResponse.json(
      { error: 'Failed to create line' },
      { status: 500 }
    );
  }
}
