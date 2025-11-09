#!/bin/bash

# コード内に旧フィールドへの参照が残っていないことを確認するスクリプト
#
# チェック対象ディレクトリ: app/, components/, hooks/, lib/
# 除外: node_modules/, .next/, output/

echo "🔍 コード内の旧フィールド参照チェック開始..."
echo ""

# 検索対象ディレクトリ
SEARCH_DIRS="app components hooks lib"

# カウンター
TOTAL_HITS=0

# Message関連の旧フィールド
echo "--- Message 関連の旧フィールド ---"

echo "📝 prevInLine を検索中..."
HITS=$(grep -r "prevInLine" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output 2>/dev/null | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "⚠️  prevInLine: $HITS 件"
  grep -rn "prevInLine" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output --color=always 2>/dev/null | head -10
  TOTAL_HITS=$((TOTAL_HITS + HITS))
else
  echo "✅ prevInLine: 0 件"
fi
echo ""

echo "📝 nextInLine を検索中..."
HITS=$(grep -r "nextInLine" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output 2>/dev/null | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "⚠️  nextInLine: $HITS 件"
  grep -rn "nextInLine" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output --color=always 2>/dev/null | head -10
  TOTAL_HITS=$((TOTAL_HITS + HITS))
else
  echo "✅ nextInLine: 0 件"
fi
echo ""

# Line関連の旧フィールド
echo "--- Line 関連の旧フィールド ---"

echo "📝 messageIds を検索中..."
HITS=$(grep -r "messageIds" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output 2>/dev/null | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "⚠️  messageIds: $HITS 件"
  grep -rn "messageIds" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output --color=always 2>/dev/null | head -10
  TOTAL_HITS=$((TOTAL_HITS + HITS))
else
  echo "✅ messageIds: 0 件"
fi
echo ""

echo "📝 startMessageId を検索中..."
HITS=$(grep -r "startMessageId" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output 2>/dev/null | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "⚠️  startMessageId: $HITS 件"
  grep -rn "startMessageId" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output --color=always 2>/dev/null | head -10
  TOTAL_HITS=$((TOTAL_HITS + HITS))
else
  echo "✅ startMessageId: 0 件"
fi
echo ""

echo "📝 endMessageId を検索中..."
HITS=$(grep -r "endMessageId" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output 2>/dev/null | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "⚠️  endMessageId: $HITS 件"
  grep -rn "endMessageId" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output --color=always 2>/dev/null | head -10
  TOTAL_HITS=$((TOTAL_HITS + HITS))
else
  echo "✅ endMessageId: 0 件"
fi
echo ""

# branchFromMessageId（Message と Line 両方で使用）
echo "--- branchFromMessageId (Message & Line) ---"

echo "📝 branchFromMessageId を検索中..."
HITS=$(grep -r "branchFromMessageId" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output 2>/dev/null | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "⚠️  branchFromMessageId: $HITS 件"
  grep -rn "branchFromMessageId" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output --color=always 2>/dev/null | head -10
  TOTAL_HITS=$((TOTAL_HITS + HITS))
else
  echo "✅ branchFromMessageId: 0 件"
fi
echo ""

# BranchPoint関連
echo "--- BranchPoint 関連 ---"

echo "📝 BranchPoint を検索中..."
HITS=$(grep -r "BranchPoint" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output 2>/dev/null | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "⚠️  BranchPoint: $HITS 件"
  grep -rn "BranchPoint" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output --color=always 2>/dev/null | head -10
  TOTAL_HITS=$((TOTAL_HITS + HITS))
else
  echo "✅ BranchPoint: 0 件"
fi
echo ""

echo "📝 branchPoints を検索中..."
HITS=$(grep -r "branchPoints" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output 2>/dev/null | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "⚠️  branchPoints: $HITS 件"
  grep -rn "branchPoints" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output --color=always 2>/dev/null | head -10
  TOTAL_HITS=$((TOTAL_HITS + HITS))
else
  echo "✅ branchPoints: 0 件"
fi
echo ""

echo "📝 BRANCH_POINTS_SUBCOLLECTION を検索中..."
HITS=$(grep -r "BRANCH_POINTS_SUBCOLLECTION" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output 2>/dev/null | wc -l | tr -d ' ')
if [ "$HITS" -gt 0 ]; then
  echo "⚠️  BRANCH_POINTS_SUBCOLLECTION: $HITS 件"
  grep -rn "BRANCH_POINTS_SUBCOLLECTION" $SEARCH_DIRS --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=output --color=always 2>/dev/null | head -10
  TOTAL_HITS=$((TOTAL_HITS + HITS))
else
  echo "✅ BRANCH_POINTS_SUBCOLLECTION: 0 件"
fi
echo ""

# 結果サマリー
echo "=== チェック結果 ==="
echo ""

if [ "$TOTAL_HITS" -eq 0 ]; then
  echo "✅ 旧フィールドへの参照は見つかりませんでした！"
  echo ""
  exit 0
else
  echo "⚠️  合計 $TOTAL_HITS 件の旧フィールド参照が見つかりました。"
  echo ""
  echo "💡 これらの参照を削除または更新してください。"
  echo ""
  exit 1
fi
