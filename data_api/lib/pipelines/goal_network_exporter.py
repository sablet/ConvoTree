#!/usr/bin/env python3
"""
ゴールネットワークをMarkdownリスト形式でエクスポート

各ルートノード（Ultra Intent）とその子孫を階層的にエクスポートする。
"""

import json
from pathlib import Path
from typing import Dict, List, Set


OUTPUT_DIR = Path("output/goal_network")


class GoalNetworkExporter:
    """ゴールネットワークをMarkdown形式でエクスポート"""

    def __init__(self, network_json_path: str):
        """
        Args:
            network_json_path: ultra_intent_goal_network.jsonのパス
        """
        self.json_path = Path(network_json_path)
        with open(self.json_path, "r", encoding="utf-8") as f:
            self.network = json.load(f)

        self.root_nodes = self.network.get("root_nodes", [])
        self.nodes = self.network.get("nodes", {})
        self.relations = self.network.get("relations", [])

        # 親→子のマッピングを構築（goal-means関係: from(子) -> to(親)）
        self.parent_to_children: Dict[str, List[str]] = {}
        for rel in self.relations:
            parent_id = rel["to"]
            child_id = rel["from"]
            if parent_id not in self.parent_to_children:
                self.parent_to_children[parent_id] = []
            self.parent_to_children[parent_id].append(child_id)

        print(f"✓ {len(self.root_nodes)}件のルートノードを読み込みました")
        print(f"✓ {len(self.nodes)}件のノードが存在します")
        print(f"✓ {len(self.relations)}件のリレーションが存在します")

    def _get_descendants(
        self, node_id: str, visited: Set[str] | None = None
    ) -> List[str]:
        """
        指定されたノードの全ての子孫を取得（再帰的）

        Args:
            node_id: ルートノードID
            visited: 訪問済みノードのセット（循環参照対策）

        Returns:
            子孫ノードIDのリスト
        """
        if visited is None:
            visited = set()

        if node_id in visited:
            return []

        visited.add(node_id)
        descendants = []

        # 直接の子ノードを取得
        children = self.parent_to_children.get(node_id, [])
        for child_id in children:
            descendants.append(child_id)
            # 再帰的に子孫を取得
            descendants.extend(self._get_descendants(child_id, visited))

        return descendants

    def _build_tree_recursive(
        self, node_id: str, indent_level: int, visited: Set[str]
    ) -> List[str]:
        """
        ノードを起点として階層的なmarkdownリストを構築（再帰的）

        Args:
            node_id: 現在のノードID
            indent_level: インデントレベル
            visited: 訪問済みノードのセット（循環参照対策）

        Returns:
            markdownリストの行のリスト
        """
        if node_id in visited:
            return []

        visited.add(node_id)
        lines = []

        # ノード情報を取得
        node = self.nodes.get(node_id, {})
        intent_text = node.get("intent", "不明")
        node_type = node.get("type", "unknown")
        status = node.get("status", "")

        # インデント作成
        indent = "  " * indent_level

        # ノード情報をフォーマット
        node_info = f"{indent}- **{intent_text}**"
        if status:
            node_info += f" `[{status}]`"
        node_info += f" _{node_type}_ `{node_id}`"

        lines.append(node_info)

        # 子ノードを再帰的に追加
        children = self.parent_to_children.get(node_id, [])
        for child_id in children:
            child_lines = self._build_tree_recursive(
                child_id, indent_level + 1, visited
            )
            lines.extend(child_lines)

        return lines

    @staticmethod
    def _format_node_properties(node: Dict) -> str:
        """ノードのプロパティを{...}形式でフォーマット"""
        props = []

        # objective_facts（存在する場合のみ）
        if node.get("objective_facts"):
            props.append(f'objective_facts="{node["objective_facts"]}"')

        # context（存在する場合のみ）
        if node.get("context"):
            props.append(f'context="{node["context"]}"')

        # status（必須）
        status = node.get("status", "idea")
        props.append(f"status={status}")

        # id（必須）
        node_id = node.get("id", "")
        props.append(f"id={node_id}")

        return "{" + " ".join(props) + "}"

    def _build_root_with_children(
        self, root: Dict, include_section_header: bool = False
    ) -> List[str]:
        """
        ルートノードとその直接の子ノードのmarkdown行を生成

        Args:
            root: ルートノード情報
            include_section_header: セクションヘッダーを含めるか

        Returns:
            markdown行のリスト
        """
        lines = []
        root_id = root["id"]

        # ルートノード情報を取得
        root_node = self.nodes.get(root_id, {})
        root_intent = root_node.get("intent", root.get("intent", ""))
        root_props = self._format_node_properties(root_node)

        # セクションヘッダー（オプション）
        if include_section_header:
            lines.append(f"## {root_intent}")
            lines.append("")

        # ルートノード
        lines.append(f"- {root_intent} {root_props}")

        # 直接の子ノードを取得
        direct_children = self.parent_to_children.get(root_id, [])
        for child_id in direct_children:
            child_node = self.nodes.get(child_id, {})
            child_intent = child_node.get("intent", "不明")
            child_props = self._format_node_properties(child_node)
            lines.append(f"  - {child_intent} {child_props}")

        return lines

    def _save_markdown_and_print_stats(
        self, markdown_lines: List[str], output_path: Path, file_type: str
    ) -> str:
        """
        Markdownファイルを保存して統計情報を表示

        Args:
            markdown_lines: Markdown行のリスト
            output_path: 出力ファイルパス
            file_type: ファイルタイプ（表示用）

        Returns:
            生成されたmarkdownテキスト
        """
        # ファイルに書き込み
        output_path.parent.mkdir(parents=True, exist_ok=True)
        markdown_text = "\n".join(markdown_lines)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(markdown_text)

        # 統計情報
        total_children = sum(
            len(self.parent_to_children.get(root["id"], [])) for root in self.root_nodes
        )

        print(f"\n💾 {file_type}を保存: {output_path}")
        print(f"✓ {len(self.root_nodes)}件のルートノードをエクスポート")
        print(f"✓ {total_children}件の直接の子ノードをエクスポート")

        return markdown_text

    def export_to_markdown(self, output_path: Path | None = None) -> str:
        """
        各ルートノードとその直接の子供を単一のツリー形式でエクスポート
        intent_relations_ultra_{i}_raw_response.mdと同じフォーマット

        Args:
            output_path: 出力ファイルパス（Noneの場合はデフォルトパス使用）

        Returns:
            生成されたmarkdownテキスト
        """
        if output_path is None:
            output_path = OUTPUT_DIR / "ultra_intent_hierarchy.md"

        markdown_lines = []

        # 各ルートノードとその直接の子供を表示
        for root in self.root_nodes:
            markdown_lines.extend(self._build_root_with_children(root))

        return self._save_markdown_and_print_stats(
            markdown_lines, output_path, "Markdownファイル"
        )

    def export_to_markdown_sectioned(self, output_path: Path | None = None) -> str:
        """
        各ルートノードごとにセクション分けしてエクスポート

        Args:
            output_path: 出力ファイルパス（Noneの場合はデフォルトパス使用）

        Returns:
            生成されたmarkdownテキスト
        """
        if output_path is None:
            output_path = OUTPUT_DIR / "ultra_intent_hierarchy_sectioned.md"

        markdown_lines = []

        # 各ルートノードごとにセクション分けして表示
        for root in self.root_nodes:
            markdown_lines.extend(
                self._build_root_with_children(root, include_section_header=True)
            )
            markdown_lines.append("")

        return self._save_markdown_and_print_stats(
            markdown_lines, output_path, "セクション分けMarkdownファイル"
        )


def export_goal_network_to_markdown(
    input_path: str = "output/goal_network/ultra_intent_goal_network.json",
    output_path: str | None = None,
) -> None:
    """
    ゴールネットワークをMarkdownリスト形式でエクスポート

    2つのファイルを生成：
    1. 単一ツリー形式（セクション分けなし）
    2. Ultra Intentごとにセクション分け形式

    Args:
        input_path: ultra_intent_goal_network.jsonのパス
        output_path: 出力Markdownファイルパス（Noneの場合はデフォルト）
    """
    print("=" * 60)
    print("ゴールネットワークMarkdownエクスポート")
    print("=" * 60)
    print(f"\n入力: {input_path}")
    if output_path:
        print(f"出力: {output_path}")
    print()

    exporter = GoalNetworkExporter(input_path)

    # 1. 単一ツリー形式
    output_file = Path(output_path) if output_path else None
    exporter.export_to_markdown(output_file)

    # 2. セクション分け形式
    exporter.export_to_markdown_sectioned()

    print("\n" + "=" * 60)
    print("✅ 完了！")
    print("=" * 60)
