#!/usr/bin/env python3
"""
ゴールネットワーク構築システム

クラスタリング結果からインテント間の目的→手段リレーションを抽出し、
ゴールネットワークを構築する。
"""

import json
import sys
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import pandas as pd  # type: ignore[import-untyped]

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib import gemini_client

# Gemini API 初期化
gemini_client.initialize()

# 出力ディレクトリ
OUTPUT_DIR = Path("output/goal_network")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# テンプレートディレクトリ
TEMPLATE_DIR = Path("templates")

# ゴールネットワーク構築用定数
MIN_COVERED_INTENTS = (
    2  # Ultra Intent配下のIntentが少なすぎる場合にリレーション抽出をスキップ
)
FULL_COVERAGE_RATE = 100  # 完全網羅率（パーセント）
MAX_DISPLAY_NODES = 5  # レポート表示時の最大ノード表示数


class UltraIntentGoalNetworkBuilder:
    """Ultra Intentsをルートとしたゴールネットワークの構築"""

    def __init__(
        self,
        ultra_intents_path: str,
        target_ultra_id: Optional[int] = None,
        save_prompts: bool = False,
    ):
        """
        Args:
            ultra_intents_path: ultra_intents_enriched.jsonのパス
            target_ultra_id: 処理対象のUltra Intent ID（None=全て）
            save_prompts: プロンプト/レスポンスを保存するか
        """
        self.json_path = Path(ultra_intents_path)
        with open(self.json_path, "r", encoding="utf-8") as f:
            self.data = json.load(f)

        all_ultra_intents = self.data.get("ultra_intents", [])

        # target_ultra_id が指定されている場合はフィルタ
        self.target_ultra_id: int | None
        if target_ultra_id is not None:
            if 0 <= target_ultra_id < len(all_ultra_intents):
                self.ultra_intents = [all_ultra_intents[target_ultra_id]]
                self.target_ultra_id = target_ultra_id
                print(f"✓ Ultra Intent {target_ultra_id} のみを処理対象としました")
            else:
                raise ValueError(
                    f"Ultra Intent ID {target_ultra_id} は範囲外です (有効範囲: 0-{len(all_ultra_intents) - 1})"
                )
        else:
            self.ultra_intents = all_ultra_intents
            self.target_ultra_id = None
            print(f"✓ {len(self.ultra_intents)}件のultra_intentsを読み込みました")

        # 統計情報を表示
        total_intents = sum(
            len(ui.get("covered_intents_details", [])) for ui in self.ultra_intents
        )
        print(f"✓ 合計 {total_intents}件の個別intentsが含まれています")

        # プロンプト/レスポンス保存用ディレクトリ
        self.save_prompts = save_prompts
        if save_prompts:
            self.ultra_prompt_dir = OUTPUT_DIR / "ultra_prompts_responses"
            self.ultra_prompt_dir.mkdir(parents=True, exist_ok=True)

    def _process_single_ultra_intent(self, list_idx: int) -> Dict:
        """
        1つの Ultra Intent を処理する関数（並列実行用）

        Args:
            list_idx: ultra_intents リスト内のインデックス

        Returns:
            処理結果の辞書
        """
        ultra_intent = self.ultra_intents[list_idx]
        ultra_idx = (
            self.target_ultra_id if self.target_ultra_id is not None else list_idx
        )
        ultra_id = f"ultra_{ultra_idx}"

        # Ultra Intentノード情報
        ultra_node = {
            "id": ultra_id,
            "type": "ultra_intent",
            "intent": ultra_intent.get("ultra_intent", ""),
            "objective_facts": ultra_intent.get("objective_facts", ""),
            "context": ultra_intent.get("context", ""),
            "status": ultra_intent.get("aggregate_status", "idea"),
            "covered_intent_count": len(
                ultra_intent.get("covered_intents_details", [])
            ),
        }

        # 配下の個別intentを処理
        covered_intents = ultra_intent.get("covered_intents_details", [])

        # 個別intentノードを収集
        intent_nodes = {}
        for intent in covered_intents:
            intent_id = intent.get("intent_id")
            if not intent_id:
                intent_id = f"intent_{intent.get('cluster_id')}_unknown"

            intent_nodes[intent_id] = {
                "id": intent_id,
                "type": "intent",
                "intent": intent.get("intent", ""),
                "objective_facts": intent.get("objective_facts", ""),
                "context": intent.get("context", ""),
                "status": intent.get("status", "idea"),
                "cluster_id": intent.get("cluster_id"),
                "source_full_paths": intent.get("source_full_paths", []),
            }

        if len(covered_intents) < MIN_COVERED_INTENTS:
            # スキップ: 親子リレーションのみ
            relations = [
                {"from": intent_id, "to": ultra_id, "type": "goal-means"}
                for intent_id in intent_nodes
            ]
            return {
                "ultra_idx": ultra_idx,
                "ultra_id": ultra_id,
                "ultra_node": ultra_node,
                "intent_nodes": intent_nodes,
                "relations": relations,
                "generated_nodes": [],
                "raw_response": None,
                "skipped": True,
            }

        # LLMでリレーション抽出
        intent_relations_result = self._extract_intent_relations_under_ultra(
            ultra_idx, ultra_id, covered_intents, ultra_intent
        )

        return {
            "ultra_idx": ultra_idx,
            "ultra_id": ultra_id,
            "ultra_node": ultra_node,
            "intent_nodes": intent_nodes,
            "relations": intent_relations_result["relations"],
            "generated_nodes": intent_relations_result["generated_nodes"],
            "raw_response": intent_relations_result.get("raw_response"),
            "skipped": False,
        }

    def build_goal_network(self) -> Dict:
        """
        Ultra Intentsをルートとしたゴールネットワークを構築
        LLMを使って意味的なゴール-手段リレーションを抽出する

        Returns:
            {
                "root_nodes": [ultra_intent情報],
                "relations": [リレーション情報],
                "nodes": {node_id: node情報},
                "generated_nodes": [LLMが生成した中間ノード]
            }
        """
        print("\n" + "=" * 60)
        print("Ultra Intentsベースのゴールネットワーク構築（LLM使用・並列実行）")
        print("=" * 60)

        all_nodes = {}
        all_relations = []
        all_generated_nodes = []
        raw_responses = {}

        # 各 Ultra Intent 配下の個別 intent 間のリレーション抽出（並列実行）
        print(
            "\n各 Ultra Intent 配下の個別 intent 間のゴール-手段リレーション抽出中..."
        )

        # 並列実行用のインデックスリスト
        ultra_indices = list(range(len(self.ultra_intents)))

        # 並列実行
        results = gemini_client.parallel_execute(
            ultra_indices,
            self._process_single_ultra_intent,
            max_workers=5,
            desc="Ultra Intent処理中",
            unit="ultra",
        )

        # 結果を統合
        for result in results:
            ultra_idx = result["ultra_idx"]
            ultra_id = result["ultra_id"]

            # Ultra Intentノードを登録
            all_nodes[ultra_id] = result["ultra_node"]

            # 個別intentノードを登録
            all_nodes.update(result["intent_nodes"])

            # リレーションを追加
            all_relations.extend(result["relations"])

            # 生成ノードを追加
            all_generated_nodes.extend(result["generated_nodes"])

            # raw_responseを保存
            if result["raw_response"]:
                raw_responses[ultra_id] = {
                    "raw_response": result["raw_response"],
                    "ultra_intent": result["ultra_node"]["intent"],
                }

            # ログ出力
            if result["skipped"]:
                intent_count = result["ultra_node"]["covered_intent_count"]
                print(f"  Ultra {ultra_idx}: スキップ（個別intent数: {intent_count}）")
            else:
                print(
                    f"  Ultra {ultra_idx}: ✓ {len(result['relations'])}件の"
                    f"リレーション、{len(result['generated_nodes'])}件の生成ノード"
                )

        # 生成ノードを all_nodes に登録
        for gen_node in all_generated_nodes:
            node_id = gen_node["intent_id"]
            all_nodes[node_id] = {
                "id": node_id,
                "type": "generated",
                "intent": gen_node["intent"],
                "objective_facts": gen_node.get("objective_facts", ""),
                "context": gen_node.get("context", ""),
                "status": gen_node.get("status", "idea"),
            }

        # 結果を構築
        root_nodes = []
        for list_idx, ui in enumerate(self.ultra_intents):
            ultra_idx = (
                self.target_ultra_id if self.target_ultra_id is not None else list_idx
            )
            root_nodes.append(
                {
                    "id": f"ultra_{ultra_idx}",
                    "intent": ui.get("ultra_intent", ""),
                    "covered_count": len(ui.get("covered_intents_details", [])),
                }
            )

        result = {
            "root_nodes": root_nodes,
            "relations": all_relations,
            "nodes": all_nodes,
            "generated_nodes": all_generated_nodes,
            "metadata": {
                "total_ultra_intents": len(self.ultra_intents),
                "total_intents": len(
                    [n for n in all_nodes.values() if n["type"] == "intent"]
                ),
                "total_generated_nodes": len(all_generated_nodes),
                "total_relations": len(all_relations),
                "generated_at": self.data.get("generated_at", ""),
            },
        }

        print(f"\n✓ {len(root_nodes)}件のルートノード（ultra_intents）")
        print(f"✓ {result['metadata']['total_intents']}件の個別intentノード")
        print(f"✓ {result['metadata']['total_generated_nodes']}件の生成ノード")
        print(f"✓ {len(all_relations)}件のリレーション")

        # 統計情報を出力
        self._print_statistics(result, all_relations, all_nodes, raw_responses)

        return result

    def _print_statistics(
        self,
        result: Dict,
        all_relations: List[Dict],
        all_nodes: Dict,
        raw_responses: Dict,
    ) -> None:
        """
        構築されたゴールネットワークの統計情報を出力

        Args:
            result: ゴールネットワーク構築結果
            all_relations: 全てのリレーション
            all_nodes: 全てのノード
            raw_responses: Ultra IDごとのraw_response
        """
        print("\n" + "=" * 60)
        print("📊 ゴールネットワーク統計")
        print("=" * 60)

        # 1. ルート検証: LLMレスポンスにUltra Intentが含まれているか
        print("\n[1] LLMレスポンスのルート検証")
        missing_root_ultras = []
        for ultra_id, response_data in raw_responses.items():
            raw_response = response_data["raw_response"]
            ultra_intent_text = response_data["ultra_intent"]

            # レスポンスの最初の行にUltra Intentが含まれているかチェック
            first_line = raw_response.split("\n")[0] if raw_response else ""
            if ultra_id not in first_line or ultra_intent_text not in first_line:
                missing_root_ultras.append(ultra_id)

        if missing_root_ultras:
            print("  ⚠️  警告: 以下のUltra IntentがLLMレスポンスに含まれていません:")
            for ultra_id in missing_root_ultras:
                print(f"    - {ultra_id}")
        else:
            print(
                f"  ✓ 全てのLLMレスポンスにUltra Intentが含まれています ({len(raw_responses)}件)"
            )

        # 2. 入力intentの網羅率
        print("\n[2] 入力intentの網羅率")
        total_input_intents = sum(
            len(ui.get("covered_intents_details", [])) for ui in self.ultra_intents
        )

        # ノードに含まれるintent（generated以外）
        covered_intent_nodes = [
            node_id for node_id, node in all_nodes.items() if node["type"] == "intent"
        ]

        coverage_rate = (
            len(covered_intent_nodes) / total_input_intents * 100
            if total_input_intents > 0
            else 0
        )

        print(f"  入力intent数: {total_input_intents}件")
        print(f"  出力に含まれるintent数: {len(covered_intent_nodes)}件")
        print(f"  網羅率: {coverage_rate:.1f}%")

        if coverage_rate < FULL_COVERAGE_RATE:
            missing_count = total_input_intents - len(covered_intent_nodes)
            print(f"  ⚠️  警告: {missing_count}件のintentが欠落しています")

        # 3. 新規生成ノード
        print("\n[3] 新規生成ノード")
        generated_nodes = result.get("generated_nodes", [])
        print(f"  生成ノード数: {len(generated_nodes)}件")

        if generated_nodes:
            print(
                f"  生成割合: {len(generated_nodes) / total_input_intents * 100:.1f}%"
            )
            print("  生成ノード一覧:")
            for gen_node in generated_nodes[:MAX_DISPLAY_NODES]:  # 最初の数件のみ表示
                node_id = gen_node.get("intent_id", "N/A")
                intent_text = gen_node.get("intent", "N/A")
                print(f"    - {node_id}: {intent_text}")
            if len(generated_nodes) > MAX_DISPLAY_NODES:
                print(f"    ... 他{len(generated_nodes) - MAX_DISPLAY_NODES}件")

        print("\n" + "=" * 60)

    def _save_ultra_prompts_and_responses(
        self, ultra_idx: int, ultra_id: str, ultra_intent: Dict, result: Dict
    ) -> None:
        """Ultra Intentのプロンプト/レスポンスを保存"""
        if not self.save_prompts:
            return

        # プロンプトを保存
        prompt_file = (
            self.ultra_prompt_dir / f"intent_relations_ultra_{ultra_idx}_prompt.md"
        )
        with open(prompt_file, "w", encoding="utf-8") as f:
            f.write(result.get("prompt", ""))
        print(f"    💾 プロンプトを保存: {prompt_file}")

        # 生のMarkdownレスポンスを保存（ルート情報付き）
        raw_response_file = (
            self.ultra_prompt_dir
            / f"intent_relations_ultra_{ultra_idx}_raw_response.md"
        )
        root_info = self._format_ultra_root_info(ultra_intent, ultra_id)
        with open(raw_response_file, "w", encoding="utf-8") as f:
            f.write("# Ultra Intent 配下の個別 Intent 階層構造\n\n")
            f.write("## ルート: Ultra Intent\n")
            f.write(f"{root_info}\n\n")
            f.write("## 階層構造（LLMレスポンス）\n")
            f.write(result.get("raw_response", ""))
        print(f"    💾 生レスポンスを保存: {raw_response_file}")

        # パース済みJSON（relations + generated_nodes）を保存
        parsed_file = (
            self.ultra_prompt_dir / f"intent_relations_ultra_{ultra_idx}_parsed.json"
        )
        parsed_result = {
            "relations": result["relations"],
            "generated_nodes": result["generated_nodes"],
        }
        with open(parsed_file, "w", encoding="utf-8") as f:
            json.dump(parsed_result, f, ensure_ascii=False, indent=2)
        print(f"    💾 パース済みJSONを保存: {parsed_file}")

    @staticmethod
    def _format_ultra_root_info(ultra_intent: Dict, ultra_id: str) -> str:
        """Ultra Intentのルート情報を整形"""
        ultra_text = ultra_intent.get("ultra_intent", "")
        ultra_props = []
        if ultra_intent.get("objective_facts"):
            ultra_props.append(f'objective_facts="{ultra_intent["objective_facts"]}"')
        if ultra_intent.get("context"):
            ultra_props.append(f'context="{ultra_intent["context"]}"')
        ultra_props.append(f"status={ultra_intent.get('aggregate_status', 'idea')}")
        ultra_props.append(f"id={ultra_id}")
        return f"{ultra_text} {{{' '.join(ultra_props)}}}"

    def _extract_intent_relations_under_ultra(
        self,
        ultra_idx: int,
        ultra_id: str,
        covered_intents: List[Dict],
        ultra_intent: Dict,
    ) -> Dict:
        """
        1つの Ultra Intent 配下の個別 intent 間のゴール-手段リレーションをLLMで抽出

        Args:
            ultra_idx: Ultra Intent のインデックス
            ultra_id: Ultra Intent のID
            covered_intents: 配下の個別 intent のリスト
            ultra_intent: Ultra Intent の詳細情報

        Returns:
            {"relations": [...], "generated_nodes": [...]}
        """
        # Ultra専用プロンプトを使用してリレーション抽出
        result = self._extract_ultra_sub_intent_relations(
            ultra_intent, ultra_idx, covered_intents
        )

        # Ultra Intent への接続を追加
        # 最上位のノード（親を持たないノード）を Ultra Intent に接続
        relations = result["relations"]
        child_nodes = set(r["from"] for r in relations)
        parent_nodes = set(r["to"] for r in relations)
        root_nodes = parent_nodes - child_nodes

        # ルートノードから Ultra Intent へのリレーションを追加
        for root_node_id in root_nodes:
            relations.append(
                {"from": root_node_id, "to": ultra_id, "type": "goal-means"}
            )

        result["relations"] = relations

        # プロンプト/レスポンスを保存
        self._save_ultra_prompts_and_responses(
            ultra_idx, ultra_id, ultra_intent, result
        )

        return result

    @staticmethod
    def save_network(network: Dict, output_path: Optional[Path] = None) -> None:
        """ゴールネットワークをJSONファイルに保存"""
        if output_path is None:
            output_path = OUTPUT_DIR / "ultra_intent_goal_network.json"

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(network, f, ensure_ascii=False, indent=2)

        print(f"\n💾 ゴールネットワークを保存: {output_path}")

    @staticmethod
    def _clean_markdown_response(response_text: str) -> str:
        """Markdownコードブロックを除去"""
        if response_text.startswith("```markdown"):
            return response_text.replace("```markdown", "").replace("```", "").strip()
        if response_text.startswith("```"):
            return response_text.replace("```", "").strip()
        return response_text

    @staticmethod
    def _extract_node_info(line_stripped: str, intent_id: str) -> Dict:
        """generated_XXX または ultra_XXX ノードの情報を抽出"""
        import re

        # ラベルテキストから抽出: "- テキスト {..." の形式
        match_label = re.match(r"^[\s\-\*]+(.+?)\s*\{", line_stripped)
        intent_text = match_label.group(1).strip() if match_label else ""

        # statusを抽出
        match_status = re.search(r"status=(\w+)", line_stripped)
        status = match_status.group(1) if match_status else "idea"

        # contextを抽出（任意）
        match_context = re.search(r'context="([^"]*)"', line_stripped)
        context = match_context.group(1) if match_context else ""

        # objective_factsを抽出（任意）
        match_facts = re.search(r'objective_facts="([^"]*)"', line_stripped)
        objective_facts = match_facts.group(1) if match_facts else ""

        return {
            "intent_id": intent_id,
            "intent": intent_text,
            "status": status,
            "context": context,
            "objective_facts": objective_facts,
        }

    @staticmethod
    def _parse_line_with_level(line: str) -> Optional[Dict[str, int | str | None]]:
        """行からインデントレベルとIntent IDを抽出"""
        import re

        line_stripped = line.rstrip()
        if not line_stripped or not line_stripped.lstrip().startswith(("-", "*")):
            return None

        # インデントレベルを計算（2スペースごとに1レベル）
        indent = len(line) - len(line.lstrip())
        level: int = indent // 2

        # Intent IDを抽出（intent_XXXXX, generated_XXX, ultra_XXX 対応）
        match_id = re.search(
            r"\{[^}]*id=(intent_\d+_\d+|generated_\d+|ultra_\d+)[^}]*\}",
            line_stripped,
        )
        intent_id = match_id.group(1) if match_id else None

        return {"level": level, "intent_id": intent_id, "text": line_stripped}

    @staticmethod
    def _build_hierarchical_relations(
        lines_with_level: List[Dict[str, int | str | None]],
    ) -> List[Dict]:
        """階層構造をたどってリレーションを構築"""
        relations = []
        for i, current in enumerate(lines_with_level):
            if current["intent_id"] is None:
                continue

            # 親を探す
            parent_id = None
            current_level = current["level"]
            for j in range(i - 1, -1, -1):
                # level is always int from indent // 2
                prev_level = lines_with_level[j]["level"]
                if (
                    isinstance(prev_level, int)
                    and isinstance(current_level, int)
                    and prev_level < current_level
                    and lines_with_level[j]["intent_id"]
                ):
                    parent_id = lines_with_level[j]["intent_id"]
                    break

            # 親が見つかった場合、リレーションを追加
            if parent_id:
                relations.append(
                    {
                        "from": current["intent_id"],
                        "to": parent_id,
                        "type": "goal-means",
                    }
                )
        return relations

    @staticmethod
    def _format_intents_list(
        intents_df: pd.DataFrame, use_intent_id: bool
    ) -> List[Dict]:
        """DataFrameからIntentリストを整形"""
        intents_list = []
        for i, (_idx, row) in enumerate(intents_df.iterrows()):
            if use_intent_id and "intent_id" in intents_df.columns:
                intent_id = row["intent_id"]
            else:
                intent_id = (
                    row["intent_id"]
                    if "intent_id" in intents_df.columns
                    else f"intent_{i}"
                )

            intents_list.append({"id": intent_id, "text": row["intent"]})
        return intents_list

    def _parse_relations_and_nodes(
        self, response_text: str
    ) -> Tuple[List[Dict], List[Dict]]:
        """レスポンステキストからリレーションとノードを抽出"""
        relations = []
        generated_nodes = []
        lines_with_level: List[Dict[str, int | str | None]] = []

        for line in response_text.split("\n"):
            parsed = self._parse_line_with_level(line)
            if parsed is None:
                continue

            intent_id = parsed["intent_id"]
            # generated_XXX または ultra_XXX の場合、ノード情報を抽出
            if (
                intent_id
                and isinstance(intent_id, str)
                and (
                    intent_id.startswith("generated_") or intent_id.startswith("ultra_")
                )
            ):
                node_info = self._extract_node_info(parsed["text"], intent_id)  # type: ignore[arg-type]
                generated_nodes.append(node_info)

            lines_with_level.append(parsed)

        # 階層構造をたどってリレーションを構築
        relations = self._build_hierarchical_relations(lines_with_level)

        return relations, generated_nodes

    @staticmethod
    def _format_ultra_intent_with_props(ultra_intent: Dict, ultra_id: str) -> str:
        """Ultra intentをプロパティ付きでフォーマット"""
        ultra_text = ultra_intent.get("ultra_intent", "")
        ultra_props = []
        if ultra_intent.get("objective_facts"):
            ultra_props.append(f'objective_facts="{ultra_intent["objective_facts"]}"')
        if ultra_intent.get("context"):
            ultra_props.append(f'context="{ultra_intent["context"]}"')
        ultra_props.append(f"status={ultra_intent.get('aggregate_status', 'idea')}")
        ultra_props.append(f"id={ultra_id}")
        return f"{ultra_text} {{{' '.join(ultra_props)}}}"

    @staticmethod
    def _format_intent_list_with_props(covered_intents: List[Dict]) -> str:
        """Intentリストをプロパティ付きでフォーマット"""
        intent_lines = []
        for idx, intent in enumerate(covered_intents):
            intent_id = (
                intent.get("intent_id") or f"intent_{intent.get('cluster_id')}_unknown"
            )
            intent_text = intent.get("intent", "")
            props = []
            if intent.get("objective_facts"):
                props.append(f'objective_facts="{intent["objective_facts"]}"')
            if intent.get("context"):
                props.append(f'context="{intent["context"]}"')
            props.append(f"status={intent.get('status', 'idea')}")
            props.append(f"id={intent_id}")
            formatted = f"{intent_text} {{{' '.join(props)}}}"
            intent_lines.append(f"{idx + 1}. {formatted}")
        return "\n".join(intent_lines)

    def _build_ultra_prompt(
        self, root_ultra_intent: str, ultra_id: str, intents_text: str
    ) -> str:
        """Ultra専用プロンプトを構築"""
        template_path = TEMPLATE_DIR / "ultra_sub_intent_relations_prompt.md"
        with open(template_path, "r", encoding="utf-8") as f:
            prompt_template = f.read()
        prompt_template = self._expand_common_placeholders(prompt_template)
        prompt = prompt_template.replace("{root_ultra_intent}", root_ultra_intent)
        prompt = prompt.replace("{root_id}", ultra_id)
        return prompt.replace("{intents_text}", intents_text)

    def _parse_response_and_extract_relations(
        self, response_text: str
    ) -> tuple[list, list]:
        """レスポンスをパースしてリレーションとノードを抽出"""
        generated_nodes = []
        lines_with_level: List[Dict[str, int | str | None]] = []

        for line in response_text.split("\n"):
            parsed = self._parse_line_with_level(line)
            if parsed is None:
                continue

            intent_id = parsed["intent_id"]
            if (
                intent_id
                and isinstance(intent_id, str)
                and (
                    intent_id.startswith("generated_") or intent_id.startswith("ultra_")
                )
            ):
                node_info = self._extract_node_info(parsed["text"], intent_id)  # type: ignore[arg-type]
                generated_nodes.append(node_info)

            lines_with_level.append(parsed)

        relations = self._build_hierarchical_relations(lines_with_level)
        return relations, generated_nodes

    def _extract_ultra_sub_intent_relations(
        self, ultra_intent: Dict, ultra_idx: int, covered_intents: List[Dict]
    ) -> Dict:
        """
        Ultra Intent 配下の個別 Intent 間のゴール-手段リレーションをLLMで抽出（Ultra専用テンプレート使用）

        Args:
            ultra_intent: ルートとなる Ultra Intent
            ultra_idx: Ultra Intent のインデックス
            covered_intents: 配下の個別 Intent のリスト

        Returns:
            {
                "relations": [...],
                "generated_nodes": [...],
                "raw_response": str,
                "prompt": str
            }
        """
        ultra_id = f"ultra_{ultra_idx}"
        root_ultra_intent = (
            UltraIntentGoalNetworkBuilder._format_ultra_intent_with_props(
                ultra_intent, ultra_id
            )
        )
        intents_text = UltraIntentGoalNetworkBuilder._format_intent_list_with_props(
            covered_intents
        )
        prompt = self._build_ultra_prompt(root_ultra_intent, ultra_id, intents_text)

        try:
            model = gemini_client.GenerativeModel()
            response = model.generate_content(prompt)
            response_text = self._clean_markdown_response(response.text.strip())
            relations, generated_nodes = self._parse_response_and_extract_relations(
                response_text
            )

            return {
                "relations": relations,
                "generated_nodes": generated_nodes,
                "raw_response": response_text,
                "prompt": prompt,
            }

        except Exception as e:
            print(f"  ❌ エラー: {e}")
            import traceback

            traceback.print_exc()
            return {
                "relations": [],
                "generated_nodes": [],
                "raw_response": "",
                "prompt": prompt if "prompt" in locals() else "",
            }

    @staticmethod
    def _expand_common_placeholders(template: str) -> str:
        """
        {{common:xxx}} プレースホルダーを展開

        Args:
            template: テンプレート文字列

        Returns:
            展開済みテンプレート文字列
        """
        import re

        # common テンプレートを読み込み
        common_file = TEMPLATE_DIR / "common" / "intent_object_common.md"
        with open(common_file, "r", encoding="utf-8") as f:
            common_content = f.read()

        # intent_definition を抽出
        intent_def_match = re.search(
            r"## intent の定義\n\n(.+?)(?=\n## |\Z)", common_content, re.DOTALL
        )
        intent_definition = (
            intent_def_match.group(1).strip() if intent_def_match else ""
        )

        # objective_facts_definition を抽出
        facts_def_match = re.search(
            r"## objective_facts の定義\n\n(.+?)(?=\n## |\Z)", common_content, re.DOTALL
        )
        objective_facts_definition = (
            facts_def_match.group(1).strip() if facts_def_match else ""
        )

        # プレースホルダーを置換
        template = template.replace(
            "{{common:intent_definition}}",
            f"## Intent（意図）の定義\n\n{intent_definition}",
        )
        return template.replace(
            "{{common:objective_facts_definition}}",
            f"## objective_facts（客観的根拠）の判定基準\n\n{objective_facts_definition}",
        )


class GoalNetworkBuilder:
    """ゴールネットワークの構築"""

    def __init__(self, clustered_csv_path: str):
        """
        Args:
            clustered_csv_path: クラスタリング結果CSVのパス
        """
        self.csv_path = Path(clustered_csv_path)
        self.df = pd.read_csv(self.csv_path)
        self.clusters = self.df["cluster"].unique()
        print(f"✓ {len(self.df)}件のインテントを読み込みました")
        print(f"✓ {len(self.clusters)}個のクラスタが存在します")

    def build_cluster_relations(
        self, target_cluster_ids: List[int] | None = None
    ) -> Dict[int, List[Dict]]:
        """
        クラスタごとに目的→手段リレーションを抽出

        Args:
            target_cluster_ids: 処理対象のクラスタIDリスト（Noneの場合は全クラスタ）

        Returns:
            {cluster_id: [{"from": intent_id, "to": intent_id, "type": "goal-means"}, ...]}
        """
        cluster_relations: Dict[int, List[Dict]] = {}
        all_generated_nodes = []

        print("\n" + "=" * 60)
        print("クラスタごとのリレーション抽出")
        print("=" * 60)

        # 処理対象のクラスタを決定
        if target_cluster_ids is not None:
            clusters_to_process = [
                c for c in sorted(self.clusters) if c in target_cluster_ids
            ]
            print(f"対象クラスタ: {clusters_to_process}")
        else:
            clusters_to_process = sorted(self.clusters)

        for cluster_id in clusters_to_process:
            print(f"\nクラスタ {cluster_id} を処理中...")
            cluster_intents = self.df[self.df["cluster"] == cluster_id]

            if len(cluster_intents) < MIN_COVERED_INTENTS:
                print(f"  ⚠️  スキップ（インテント数: {len(cluster_intents)}）")
                cluster_relations[int(cluster_id)] = []
                continue

            result = self._extract_goal_means_relations(cluster_intents)
            relations = result["relations"]
            generated_nodes = result["generated_nodes"]

            cluster_relations[int(cluster_id)] = relations

            # generated_nodes にクラスタIDを追加
            for node in generated_nodes:
                node["cluster"] = int(cluster_id)
            all_generated_nodes.extend(generated_nodes)

            print(
                f"  ✓ {len(relations)}件のリレーション、{len(generated_nodes)}件のgenerated nodeを抽出"
            )

        # 保存
        output_path = OUTPUT_DIR / "cluster_relations.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(cluster_relations, f, ensure_ascii=False, indent=2)
        print(f"\n💾 クラスタリレーションを保存: {output_path}")

        # generated_nodesも保存
        if all_generated_nodes:
            gen_output_path = OUTPUT_DIR / "cluster_generated_nodes.json"
            with open(gen_output_path, "w", encoding="utf-8") as f:
                json.dump(all_generated_nodes, f, ensure_ascii=False, indent=2)
            print(
                f"💾 Generated nodesを保存: {gen_output_path} ({len(all_generated_nodes)}件)"
            )

        return cluster_relations

    def extract_hub_intents(
        self, cluster_relations: Dict[int, List[Dict]]
    ) -> List[Dict]:
        """
        ハブIntent（抽象度が高い目的）を抽出

        各クラスタから最低1つ、目的としてより多く参照されるIntentを抽出

        Returns:
            [{"intent_id": str, "cluster": int, "intent": str, "hub_score": int}, ...]
        """
        print("\n" + "=" * 60)
        print("ハブIntent抽出")
        print("=" * 60)

        # 各Intentの「目的」としての参照回数をカウント
        intent_as_goal_count: Dict[str, int] = {}

        for _cluster_id, relations in cluster_relations.items():
            for rel in relations:
                # "to"が目的、"from"が手段
                to_intent_id = rel["to"]
                intent_as_goal_count[to_intent_id] = (
                    intent_as_goal_count.get(to_intent_id, 0) + 1
                )

        # クラスタごとにハブIntentを選択
        hub_intents = []

        # cluster_relationsに含まれるクラスタのみ処理
        target_clusters = sorted([int(c) for c in cluster_relations])
        print(f"対象クラスタ: {target_clusters}")

        for cluster_id in target_clusters:
            cluster_intents = self.df[self.df["cluster"] == cluster_id]
            cluster_intent_ids = cluster_intents["intent_id"].tolist()

            # このクラスタ内のIntentで、目的として最も参照されるもの
            max_score = -1
            hub_intent_id = None

            for intent_id in cluster_intent_ids:
                score = intent_as_goal_count.get(intent_id, 0)
                if score > max_score:
                    max_score = score
                    hub_intent_id = intent_id

            # スコアが0の場合でも、最初のIntentを選択（各クラスタから最低1つ）
            if hub_intent_id is None and len(cluster_intent_ids) > 0:
                hub_intent_id = cluster_intent_ids[0]
                max_score = 0

            if hub_intent_id:
                intent_row = self.df[self.df["intent_id"] == hub_intent_id].iloc[0]
                hub_intents.append(
                    {
                        "intent_id": hub_intent_id,
                        "cluster": int(cluster_id),
                        "intent": intent_row["intent"],
                        "hub_score": max_score,
                    }
                )
                print(f"  クラスタ {cluster_id}: {hub_intent_id} (score: {max_score})")

        # 保存
        output_path = OUTPUT_DIR / "hub_intents.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(hub_intents, f, ensure_ascii=False, indent=2)
        print(f"\n💾 ハブIntentを保存: {output_path}")
        print(f"✓ 合計 {len(hub_intents)}件のハブIntentを抽出")

        return hub_intents

    def build_hub_relations(self, hub_intents: List[Dict]) -> List[Dict]:
        """
        ハブIntent間のリレーションを構築

        Returns:
            [{"from": intent_id, "to": intent_id, "type": "goal-means"}, ...]
        """
        print("\n" + "=" * 60)
        print("ハブIntent間リレーション構築")
        print("=" * 60)

        if len(hub_intents) < MIN_COVERED_INTENTS:
            print("  ⚠️  ハブIntentが不足（2件未満）")
            # 空のファイルを保存
            output_path = OUTPUT_DIR / "hub_relations.json"
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump([], f, ensure_ascii=False, indent=2)
            print(f"💾 ハブリレーションを保存: {output_path}")
            return []

        # ハブIntentをDataFrameに変換
        hub_df = pd.DataFrame(hub_intents)

        # リレーション抽出
        result = self._extract_goal_means_relations(hub_df, use_intent_id=True)
        relations = result["relations"]
        generated_nodes = result["generated_nodes"]

        # 保存
        output_path = OUTPUT_DIR / "hub_relations.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(relations, f, ensure_ascii=False, indent=2)
        print(f"\n💾 ハブリレーションを保存: {output_path}")
        print(
            f"✓ {len(relations)}件のリレーション、{len(generated_nodes)}件のgenerated nodeを抽出"
        )

        # hub generated_nodesも保存
        if generated_nodes:
            gen_output_path = OUTPUT_DIR / "hub_generated_nodes.json"
            with open(gen_output_path, "w", encoding="utf-8") as f:
                json.dump(generated_nodes, f, ensure_ascii=False, indent=2)
            print(f"💾 Hub generated nodesを保存: {gen_output_path}")

        return relations

    @staticmethod
    def _extract_goal_means_relations(
        intents_df: pd.DataFrame, use_intent_id: bool = False
    ) -> Dict:
        """
        LLMを使用して目的→手段リレーションを抽出

        Args:
            intents_df: インテントのDataFrame
            use_intent_id: Trueの場合、返り値にintent_idを使用

        Returns:
            {
                "relations": [{"from": id, "to": id, "type": "goal-means"}, ...],
                "generated_nodes": [...],
                "raw_response": str (LLMの生Markdownレスポンス),
                "prompt": str (LLMに送信したプロンプト)
            }
        """
        # Intentリストを整形
        intents_list = UltraIntentGoalNetworkBuilder._format_intents_list(
            intents_df, use_intent_id
        )

        # プロンプト作成（新形式: {} プロパティ記法、冗長なintentフィールドは除く）
        intents_text = "\n".join(
            [
                f"{i + 1}. {intent['text']} {{id={intent['id']}}}"
                for i, intent in enumerate(intents_list)
            ]
        )

        # テンプレート読み込み
        template_path = TEMPLATE_DIR / "goal_network_extraction_prompt.md"
        with open(template_path, "r", encoding="utf-8") as f:
            prompt_template = f.read()

        # プレースホルダーを置換（.format()ではなく.replace()を使用）
        prompt = prompt_template.replace("{intents_text}", intents_text)

        try:
            # Gemini API呼び出し
            model = gemini_client.GenerativeModel()
            response = model.generate_content(prompt)

            # Markdownリストをパース
            response_text = UltraIntentGoalNetworkBuilder._clean_markdown_response(
                response.text.strip()
            )

            # リレーションとノード情報を抽出（多階層対応）
            # _parse_relations_and_nodesを呼び出すために一時的にインスタンスを作成
            temp_builder = UltraIntentGoalNetworkBuilder.__new__(
                UltraIntentGoalNetworkBuilder
            )
            relations, generated_nodes = temp_builder._parse_relations_and_nodes(
                response_text
            )

            # 結果を返す（クリーンアップ済みのresponse_textとプロンプトも含める）
            return {
                "relations": relations,
                "generated_nodes": generated_nodes,
                "raw_response": response_text,
                "prompt": prompt,
            }

        except Exception as e:
            print(f"  ❌ エラー: {e}")
            import traceback

            traceback.print_exc()
            return {
                "relations": [],
                "generated_nodes": [],
                "raw_response": "",
                "prompt": prompt if "prompt" in locals() else "",
            }


def build_ultra_goal_network(
    input_path: str = "output/intent_extraction/cross_cluster/ultra_intents_enriched.json",
    ultra_id: Optional[int] = None,
    save_prompts: bool = False,
) -> None:
    """
    Ultra Intentsベースのゴールネットワーク構築パイプライン

    Args:
        input_path: ultra_intents_enriched.jsonのパス
        ultra_id: 処理対象のUltra Intent ID（Noneの場合は全て）
        save_prompts: プロンプト/レスポンスを保存するか
    """
    print("=" * 60)
    print("ゴールネットワーク構築（Ultra Intentsベース）")
    print("=" * 60)
    print(f"\n入力: {input_path}")
    if ultra_id is not None:
        print(f"対象: Ultra Intent {ultra_id}")
    if save_prompts:
        print("プロンプト/レスポンス保存: 有効")
    print()

    builder = UltraIntentGoalNetworkBuilder(
        input_path, target_ultra_id=ultra_id, save_prompts=save_prompts
    )
    network = builder.build_goal_network()
    builder.save_network(network)

    print("\n" + "=" * 60)
    print("✅ 完了！")
    print("=" * 60)
    print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")


def build_cluster_goal_network(
    input_path: str = "output/intent_clustering/clustered_intents.csv",
    cluster_ids: Optional[List[int]] = None,
) -> None:
    """
    クラスタベースのゴールネットワーク構築パイプライン

    Args:
        input_path: クラスタリング結果CSVのパス
        cluster_ids: 処理対象のクラスタIDリスト（Noneの場合は全クラスタ）
    """
    print("=" * 60)
    print("ゴールネットワーク構築（クラスタベース）")
    print("=" * 60)
    print(f"\n入力: {input_path}\n")

    builder = GoalNetworkBuilder(input_path)

    # クラスタごとのリレーション抽出
    cluster_relations = builder.build_cluster_relations(target_cluster_ids=cluster_ids)

    # ハブIntent抽出
    hub_intents = builder.extract_hub_intents(cluster_relations)

    # ハブIntent間リレーション構築
    _ = builder.build_hub_relations(hub_intents)

    print("\n" + "=" * 60)
    print("✅ 完了！")
    print("=" * 60)
    print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")
