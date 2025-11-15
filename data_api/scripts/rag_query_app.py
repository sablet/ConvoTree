#!/usr/bin/env python3
"""RAGクエリ検証用Streamlitアプリ"""

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path

import streamlit as st

HISTORY_DIR = Path("output/rag_query_history")
HISTORY_DIR.mkdir(parents=True, exist_ok=True)


def load_history():
    """全履歴を読み込み（日付降順）"""
    history = []
    for file in sorted(HISTORY_DIR.glob("*.json"), reverse=True):
        with file.open() as f:
            history.extend(json.load(f))
    return history


def save_history_entry(query, stdout, stderr, success):
    """履歴エントリを保存"""
    today = datetime.now().strftime("%Y-%m-%d")
    file_path = HISTORY_DIR / f"{today}.json"

    history = []
    if file_path.exists():
        with file_path.open() as f:
            history = json.load(f)

    entry = {
        "timestamp": datetime.now().isoformat(),
        "query": query,
        "stdout": stdout,
        "stderr": stderr,
        "success": success,
    }
    history.append(entry)

    with file_path.open("w") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


st.set_page_config(layout="wide")
st.title("RAG Query Tester")

# サイドバー：履歴表示
with st.sidebar:
    st.header("履歴")
    history = load_history()

    if history:
        for i, entry in enumerate(history):
            ts = datetime.fromisoformat(entry["timestamp"]).strftime("%m/%d %H:%M")
            query_preview = entry["query"][:30] + (
                "..." if len(entry["query"]) > 30 else ""
            )
            if st.button(f"{ts} - {query_preview}", key=f"hist_{i}"):
                st.session_state.selected_history = entry
    else:
        st.info("履歴なし")

# メインエリア
query = st.text_area("クエリを入力してください", height=100)

if st.button("検索実行"):
    if not query:
        st.warning("クエリを入力してください")
    else:
        with st.spinner("検索中..."):
            try:
                result = subprocess.run(
                    [
                        "uv",
                        "run",
                        "python",
                        "main.py",
                        "rag_query",
                        f"--query={query}",
                        "--answer_with_llm",
                    ],
                    capture_output=True,
                    text=True,
                    check=True,
                    env={**os.environ, "SILENT_MODE": "1"},
                )
                save_history_entry(query, result.stdout, result.stderr, True)
                st.success("検索完了")
                st.subheader("結果")
                st.code(result.stdout, language=None)

                if result.stderr:
                    with st.expander("標準エラー出力"):
                        st.code(result.stderr, language=None)

            except subprocess.CalledProcessError as e:
                save_history_entry(query, e.stdout, e.stderr, False)
                st.error(f"エラーが発生しました: {e}")
                st.subheader("標準出力")
                st.code(e.stdout, language=None)
                st.subheader("標準エラー出力")
                st.code(e.stderr, language=None)

# 履歴選択時の表示
if "selected_history" in st.session_state:
    entry = st.session_state.selected_history
    st.divider()
    st.subheader("履歴の詳細")
    st.text(f"実行日時: {entry['timestamp']}")
    st.subheader("クエリ")
    st.code(entry["query"], language=None)
    st.subheader("結果")
    st.code(entry["stdout"], language=None)
    if entry["stderr"]:
        with st.expander("標準エラー出力"):
            st.code(entry["stderr"], language=None)
