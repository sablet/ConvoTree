#!/bin/bash

set -e

echo "🚀 Setting up Vercel environment variables..."

# .env.localから環境変数を読み取る
if [ ! -f .env.local ]; then
  echo "❌ .env.local not found!"
  exit 1
fi

# 一時ファイルを作成
tmpfile=$(mktemp)

# .env.localから有効な行のみを抽出
grep -v "^#" .env.local | grep "=" | while IFS='=' read -r key value; do
  # NEXT_PUBLIC_DEBUG_SKIP_AUTHはVercelに設定しない（本番では認証必須）
  if [[ "$key" =~ DEBUG_SKIP_AUTH ]]; then
    echo "  ⏭️  Skipping $key (debug only)"
    continue
  fi

  # trim
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)

  # 値から引用符を削除
  value="${value%\"}"
  value="${value#\"}"

  echo "$key=$value" >> "$tmpfile"
done

# 環境ごとに設定
for env in production preview development; do
  echo ""
  echo "📦 Setting variables for $env..."

  while IFS='=' read -r key value; do
    [ -z "$key" ] && continue

    echo "  Setting $key..."

    # 既存の変数を削除（エラーは無視）
    vercel env rm "$key" "$env" -y 2>/dev/null || true

    # 新しい値を追加
    echo "$value" | vercel env add "$key" "$env" > /dev/null 2>&1 || {
      echo "  ⚠️  Failed to set $key for $env"
    }
  done < "$tmpfile"
done

# クリーンアップ
rm -f "$tmpfile"

echo ""
echo "✅ Environment variables setup complete!"
echo ""
echo "Next steps:"
echo "1. Verify variables: vercel env ls"
echo "2. Deploy: vercel --prod"
