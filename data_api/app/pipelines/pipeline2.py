"""Pipeline 2: Intent抽出（LLM）"""
import json
import os
from dotenv import load_dotenv
import google.generativeai as genai
from tqdm import tqdm
from app.models import Message, MessageGroup, Intent


# .env ファイルから環境変数を読み込み
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)


def run_pipeline2(
    groups: list[MessageGroup],
    messages_dict: dict[str, Message],
) -> list[Intent]:
    """
    MessageGroup から Intent を抽出する

    Args:
        groups: MessageGroup のリスト
        messages_dict: メッセージIDをキーとしたメッセージの辞書

    Returns:
        Intent のリスト
    """
    intents: list[Intent] = []

    for group in groups:
        # グループ内のメッセージを取得
        group_messages = [
            messages_dict[msg_id]
            for msg_id in group.message_ids
            if msg_id in messages_dict
        ]

        if not group_messages:
            continue

        # LLMでIntent抽出
        extracted_intents = _extract_intents(group, group_messages)
        intents.extend(extracted_intents)

    return intents


def _extract_intents(group: MessageGroup, messages: list[Message]) -> list[Intent]:
    """LLMを使用してIntentを抽出"""
    # メッセージ群を整形
    messages_text = "\n".join([
        f"[{msg.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] ({msg.message_type})\n{msg.text}"
        for msg in messages
    ])

    # プロンプト作成
    prompt = f"""以下のメッセージグループから、ユーザーが「〜したい」という意図を抽出してください。

# メッセージ群
{messages_text}

# 抽出ルール
1. 1メッセージに複数の意図 → それぞれ別のIntentとして抽出
2. 複数メッセージで1つの意図 → 1つのIntentにまとめる
3. ラベル・タイトル・キーワードのみ → 除外
4. 具体的な行動・問題・提案が記述されているもののみ抽出

# 例1: 1メッセージ→2Intent
"検索機能を追加したい。あと通知も欲しい。"
→ [{{"summary": "検索機能を追加したい"}}, {{"summary": "通知機能を追加したい"}}]

# 例2: 2メッセージ→1Intent
メッセージ1: "ログイン画面の読み込みが遅い"
メッセージ2: "パフォーマンス改善が必要"
→ [{{"summary": "ログイン画面のパフォーマンスを改善したい"}}]

# 例3: 除外
"設定" → []

# 出力: JSON配列のみ（説明不要）
"""

    try:
        # Gemini 2.5 Flash でテキスト生成
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt)

        # JSONをパース
        response_text = response.text.strip()

        # Markdown形式の場合、コードブロックを除去
        if response_text.startswith("```json"):
            response_text = response_text.replace("```json", "").replace("```", "").strip()
        elif response_text.startswith("```"):
            response_text = response_text.replace("```", "").strip()

        intents_data = json.loads(response_text)

        # Intent オブジェクトを作成
        intents: list[Intent] = []
        for i, intent_dict in enumerate(intents_data):
            intent_id = f"{group.id}_intent_{i}"
            intent = Intent(
                id=intent_id,
                group_id=group.id,
                summary=intent_dict["summary"],
                embedding=None,
            )
            intents.append(intent)

        return intents

    except Exception as e:
        print(f"Error extracting intents for group {group.id}: {e}")
        return []
