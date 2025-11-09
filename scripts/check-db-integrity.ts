/**
 * Firestoreデータベースの整合性チェックスクリプト
 *
 * チェック項目:
 * 1. 循環参照しているlineId
 * 2. 存在しないlineIdを参照しているメッセージ
 * 3. 孤立したメッセージ（どのラインにも属していない）
 * 4. 異常なタイムスタンプ
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface Message {
  id: string;
  lineId: string;
  content: string;
  deleted?: boolean;
  createdAt?: { seconds: number };
  updatedAt?: { seconds: number };
}

interface Line {
  id: string;
  parentLineId?: string;
  name: string;
  messageIds?: string[];
  createdAt?: { seconds: number };
  updatedAt?: { seconds: number };
}

async function checkDatabaseIntegrity() {
  console.log('🔍 データベース整合性チェック開始...\n');

  const conversationId = 'sample-conversation-1';

  // データ取得
  const messagesRef = collection(db, 'conversations', conversationId, 'messages');
  const linesRef = collection(db, 'conversations', conversationId, 'lines');

  const [messagesSnapshot, linesSnapshot] = await Promise.all([
    getDocs(messagesRef),
    getDocs(linesRef)
  ]);

  const messages: Message[] = messagesSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Message));

  const lines: Line[] = linesSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Line));

  console.log(`📊 取得データ: メッセージ ${messages.length}件、ライン ${lines.length}件\n`);

  // 1. 循環参照チェック
  console.log('=== 1. 循環参照チェック ===');
  const circularReferences = findCircularReferences(lines);
  if (circularReferences.length > 0) {
    console.error('❌ 循環参照が見つかりました:');
    circularReferences.forEach(cycle => {
      console.error(`  - ${cycle.join(' -> ')}`);
    });
  } else {
    console.log('✅ 循環参照なし');
  }
  console.log('');

  // 2. 存在しないlineIdを参照しているメッセージ
  console.log('=== 2. 無効なlineId参照チェック ===');
  const lineIds = new Set(lines.map(l => l.id));
  const invalidLineRefs = messages.filter(m => !m.deleted && !lineIds.has(m.lineId));
  if (invalidLineRefs.length > 0) {
    console.error(`❌ 存在しないlineIdを参照しているメッセージ (${invalidLineRefs.length}件):`);
    invalidLineRefs.forEach(m => {
      console.error(`  - メッセージID: ${m.id}, lineId: ${m.lineId}`);
    });
  } else {
    console.log('✅ 無効なlineId参照なし');
  }
  console.log('');

  // 3. 孤立したメッセージチェック
  console.log('=== 3. 孤立メッセージチェック ===');
  const messageIdsInLines = new Set<string>();
  lines.forEach(line => {
    if (line.messageIds) {
      line.messageIds.forEach(id => messageIdsInLines.add(id));
    }
  });
  const orphanedMessages = messages.filter(
    m => !m.deleted && !messageIdsInLines.has(m.id)
  );
  if (orphanedMessages.length > 0) {
    console.warn(`⚠️  孤立したメッセージ (${orphanedMessages.length}件):`);
    orphanedMessages.forEach(m => {
      console.warn(`  - メッセージID: ${m.id}, lineId: ${m.lineId}`);
    });
  } else {
    console.log('✅ 孤立メッセージなし');
  }
  console.log('');

  // 4. 削除フラグの付いたメッセージ
  console.log('=== 4. 削除済みメッセージ ===');
  const deletedMessages = messages.filter(m => m.deleted);
  if (deletedMessages.length > 0) {
    console.log(`📝 削除済みメッセージ (${deletedMessages.length}件):`);
    deletedMessages.forEach(m => {
      console.log(`  - メッセージID: ${m.id}, lineId: ${m.lineId}`);
    });
  } else {
    console.log('✅ 削除済みメッセージなし');
  }
  console.log('');

  // 5. 異常なタイムスタンプ
  console.log('=== 5. 異常なタイムスタンプチェック ===');
  const now = Date.now() / 1000;
  const futureMessages = messages.filter(m => {
    const created = m.createdAt?.seconds || 0;
    const updated = m.updatedAt?.seconds || 0;
    return created > now || updated > now;
  });
  if (futureMessages.length > 0) {
    console.error(`❌ 未来のタイムスタンプを持つメッセージ (${futureMessages.length}件):`);
    futureMessages.forEach(m => {
      console.error(`  - メッセージID: ${m.id}`);
    });
  } else {
    console.log('✅ タイムスタンプは正常');
  }
  console.log('');

  // サマリー
  console.log('=== サマリー ===');
  const issues = [
    circularReferences.length > 0 ? '循環参照' : null,
    invalidLineRefs.length > 0 ? '無効なlineId参照' : null,
    orphanedMessages.length > 0 ? '孤立メッセージ' : null,
    futureMessages.length > 0 ? '異常なタイムスタンプ' : null
  ].filter(Boolean);

  if (issues.length > 0) {
    console.error(`❌ 問題が見つかりました: ${issues.join(', ')}`);
    console.log('\n📝 修正スクリプトを実行することをお勧めします。');
  } else {
    console.log('✅ データベースの整合性は正常です');
  }
}

function findCircularReferences(lines: Line[]): string[][] {
  const cycles: string[][] = [];
  const lineMap = new Map(lines.map(l => [l.id, l]));

  lines.forEach(startLine => {
    const visited = new Set<string>();
    const path: string[] = [];

    function detectCycle(lineId: string): boolean {
      if (path.includes(lineId)) {
        // 循環を検出
        const cycleStart = path.indexOf(lineId);
        const cycle = [...path.slice(cycleStart), lineId];
        cycles.push(cycle);
        return true;
      }

      if (visited.has(lineId)) {
        return false;
      }

      visited.add(lineId);
      path.push(lineId);

      const line = lineMap.get(lineId);
      if (line?.parentLineId) {
        detectCycle(line.parentLineId);
      }

      path.pop();
      return false;
    }

    if (startLine.parentLineId) {
      detectCycle(startLine.id);
    }
  });

  return cycles;
}

checkDatabaseIntegrity()
  .then(() => {
    console.log('\n✅ チェック完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });
