"""
JSONパースエラーハンドリングユーティリティ

パース失敗時に詳細なログを出力し、失敗したレスポンスを保存します。
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

# パースエラー保存先
PARSE_ERROR_DIR = Path("output/parse_errors")
PARSE_ERROR_DIR.mkdir(parents=True, exist_ok=True)


def _extract_error_context(text: str, error_pos: int, context_size: int = 100) -> str:
    """
    エラー位置周辺のテキストを抽出

    Args:
        text: 元のテキスト
        error_pos: エラー位置
        context_size: 前後に表示する文字数

    Returns:
        エラー位置を中心としたテキスト
    """
    start = max(0, error_pos - context_size)
    end = min(len(text), error_pos + context_size)

    # エラー位置の前後を抽出
    before = text[start:error_pos]
    at_error = text[error_pos : error_pos + 1] if error_pos < len(text) else ""
    after = text[error_pos + 1 : end]

    # エラー位置を明示
    return f"{before}<<<ERROR_HERE>>>{at_error}{after}"


def _get_line_and_column(text: str, char_pos: int) -> tuple[int, int]:
    """
    文字位置から行番号と列番号を取得

    Args:
        text: 元のテキスト
        char_pos: 文字位置

    Returns:
        (行番号, 列番号) ※1-indexed
    """
    lines = text[:char_pos].split("\n")
    line_num = len(lines)
    col_num = len(lines[-1]) + 1 if lines else 1
    return line_num, col_num


def _save_parse_error(
    raw_text: str,
    error: Exception,
    context: str,
    metadata: dict[str, Any],
) -> Path:
    """
    パースエラーの詳細をファイルに保存

    Args:
        raw_text: パース対象の元テキスト
        error: 発生したエラー
        context: パース処理のコンテキスト（例: "intent_extraction_cluster_03"）
        metadata: 追加のメタデータ

    Returns:
        保存先のファイルパス
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    safe_context = re.sub(r"[^\w\-]", "_", context)
    filename = f"parse_error_{safe_context}_{timestamp}.txt"
    filepath = PARSE_ERROR_DIR / filename

    # エラー情報を整形
    error_info = [
        "=" * 80,
        "JSON PARSE ERROR",
        "=" * 80,
        f"Timestamp: {datetime.now().isoformat()}",
        f"Context: {context}",
        f"Error Type: {type(error).__name__}",
        f"Error Message: {str(error)}",
        "",
    ]

    # メタデータを追加
    if metadata:
        error_info.append("Metadata:")
        for key, value in metadata.items():
            error_info.append(f"  {key}: {value}")
        error_info.append("")

    # JSONDecodeErrorの場合は位置情報を追加
    if isinstance(error, json.JSONDecodeError):
        line_num, col_num = _get_line_and_column(raw_text, error.pos)
        error_info.extend(
            [
                f"Error Position: character {error.pos}, line {line_num}, column {col_num}",
                "",
                "Error Context (100 chars before/after):",
                "-" * 80,
                _extract_error_context(raw_text, error.pos, context_size=100),
                "-" * 80,
                "",
            ]
        )

    # 完全なレスポンステキスト
    error_info.extend(
        [
            "Full Response Text:",
            "=" * 80,
            raw_text,
            "=" * 80,
        ]
    )

    # ファイルに保存
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(error_info))

    return filepath


def safe_json_loads(  # noqa: ANN401
    text: str,
    context: str = "unknown",
    metadata: Optional[dict[str, Any]] = None,
    *,
    log_errors: bool = True,
    save_errors: bool = True,
) -> Any | None:  # noqa: ANN401
    """
    安全なJSONパース（エラーハンドリング付き）

    Args:
        text: パース対象のJSONテキスト
        context: パース処理のコンテキスト（例: "intent_extraction_cluster_03"）
        metadata: 追加のメタデータ（例: {"cluster_id": 3, "retry": 1}）
        log_errors: エラーをコンソールに出力するか
        save_errors: エラーをファイルに保存するか

    Returns:
        パース結果（失敗時はNone）
    """
    if metadata is None:
        metadata = {}

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        # エラー情報を収集
        line_num, col_num = _get_line_and_column(text, e.pos)
        error_context = _extract_error_context(text, e.pos, context_size=50)

        # コンソールにログ出力
        if log_errors:
            print(f"\n{'=' * 60}")
            print(f"❌ JSONパースエラー: {context}")
            print(f"{'=' * 60}")
            print(f"エラー内容: {e.msg}")
            print(f"位置: 文字{e.pos}, 行{line_num}, 列{col_num}")
            print("\nエラー箇所（前後50文字）:")
            print(f"{'-' * 60}")
            print(error_context)
            print(f"{'-' * 60}")

        # ファイルに保存
        if save_errors:
            filepath = _save_parse_error(text, e, context, metadata)
            if log_errors:
                print(f"\n詳細を保存: {filepath}")
                print(f"{'=' * 60}\n")

        return None
    except Exception as e:
        # その他のエラー
        if log_errors:
            print(f"\n{'=' * 60}")
            print(f"❌ 予期しないパースエラー: {context}")
            print(f"{'=' * 60}")
            print(f"エラー内容: {type(e).__name__}: {str(e)}")
            print(f"{'=' * 60}\n")

        if save_errors:
            filepath = _save_parse_error(text, e, context, metadata)
            if log_errors:
                print(f"詳細を保存: {filepath}\n")

        return None


def extract_json_from_markdown(  # noqa: ANN401
    text: str,
    context: str = "unknown",
    metadata: Optional[dict[str, Any]] = None,
    *,
    log_errors: bool = True,
    save_errors: bool = True,
) -> Any | None:  # noqa: ANN401
    """
    Markdown形式のコードブロックからJSONを抽出してパース

    Args:
        text: Markdownテキスト（```json ... ``` を含む可能性あり）
        context: パース処理のコンテキスト
        metadata: 追加のメタデータ
        log_errors: エラーをコンソールに出力するか
        save_errors: エラーをファイルに保存するか

    Returns:
        パース結果（失敗時はNone）
    """
    # コードブロックを抽出
    json_text = text.strip()

    # ```json または ``` で囲まれている場合は除去
    if json_text.startswith("```json"):
        json_text = json_text[7:].strip()
    elif json_text.startswith("```"):
        json_text = json_text[3:].strip()

    if json_text.endswith("```"):
        json_text = json_text[:-3].strip()

    # もし複数の```ブロックがある場合は最初のブロックを使用
    if "```" in json_text:
        start = json_text.find("```") + 3
        end = json_text.find("```", start)
        if end != -1:
            json_text = json_text[start:end].strip()

    # JSONパース
    return safe_json_loads(
        json_text,
        context=context,
        metadata=metadata,
        log_errors=log_errors,
        save_errors=save_errors,
    )
