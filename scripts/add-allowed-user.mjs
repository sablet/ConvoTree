#!/usr/bin/env node
/**
 * 許可リストにユーザーを追加するスクリプト
 *
 * 使用方法:
 *   node scripts/add-allowed-user.mjs user@example.com
 *   node scripts/add-allowed-user.mjs user1@example.com user2@example.com ...
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// コマンドライン引数を取得（複数可）
const emails = process.argv.slice(2);

if (emails.length === 0) {
  console.error('エラー: メールアドレスを指定してください');
  console.error('使用方法: node scripts/add-allowed-user.mjs user@example.com [user2@example.com ...]');
  process.exit(1);
}

// メールアドレスの簡易バリデーション
for (const email of emails) {
  if (!email.includes('@')) {
    console.error(`エラー: 有効なメールアドレスを指定してください: ${email}`);
    process.exit(1);
  }
}

try {
  // サービスアカウントキーを読み込み
  const serviceAccountPath = join(__dirname, '..', 'firebase-service-account.json');
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

  // Firebase Admin の初期化
  initializeApp({
    credential: cert(serviceAccount)
  });

  const db = getFirestore();

  console.log(`${emails.length} 件のユーザーを追加します...\n`);

  // バッチ処理で複数ユーザーを追加
  const batch = db.batch();

  for (const email of emails) {
    const docRef = db.collection('allowed_users').doc(email);
    batch.set(docRef, {
      allowed: true,
      addedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    console.log(`✓ ${email}`);
  }

  await batch.commit();

  console.log(`\n✓ ${emails.length} 件のユーザーを許可リストに追加しました`);

  process.exit(0);
} catch (error) {
  console.error('エラー:', error.message);
  if (error.code === 'ENOENT') {
    console.error('\nfirebase-service-account.json が見つかりません。');
    console.error('既存のスクリプトと同じサービスアカウントキーを使用してください。');
  }
  process.exit(1);
}
