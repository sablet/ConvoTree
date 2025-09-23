import { del } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Vercel Blobの画像URLかどうかをチェック
    if (!url.includes('blob.vercel-storage.com')) {
      // Vercel Blob以外のURL（base64など）は削除処理をスキップ
      return NextResponse.json({ success: true, message: 'Not a blob storage URL, skipped deletion' });
    }

    await del(url, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: 'Delete failed' },
      { status: 500 }
    );
  }
}