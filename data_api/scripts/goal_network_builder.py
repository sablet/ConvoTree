#!/usr/bin/env python3
"""
ゴールネットワーク構築システム

クラスタリング結果からインテント間の目的→手段リレーションを抽出し、
ゴールネットワークを構築する。
"""

import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Tuple
import pandas as pd
from dotenv import load_dotenv

# プロジェクトルートをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib import gemini_client

# 環境変数読み込み
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    gemini_client.configure(api_key=api_key)

# 出力ディレクトリ
OUTPUT_DIR = Path("output/goal_network")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# テンプレートディレクトリ
TEMPLATE_DIR = Path("templates")


class GoalNetworkBuilder:
    """ゴールネットワークの構築"""

    def __init__(self, clustered_csv_path: str):
        """
        Args:
            clustered_csv_path: クラスタリング結果CSVのパス
        """
        self.csv_path = Path(clustered_csv_path)
        self.df = pd.read_csv(self.csv_path)
        self.clusters = self.df['cluster'].unique()
        print(f"✓ {len(self.df)}件のインテントを読み込みました")
        print(f"✓ {len(self.clusters)}個のクラスタが存在します")

    def build_cluster_relations(self, target_cluster_ids: List[int] = None) -> Dict[int, List[Dict]]:
        """
        クラスタごとに目的→手段リレーションを抽出

        Args:
            target_cluster_ids: 処理対象のクラスタIDリスト（Noneの場合は全クラスタ）

        Returns:
            {cluster_id: [{"from": intent_id, "to": intent_id, "type": "goal-means"}, ...]}
        """
        cluster_relations = {}
        all_generated_nodes = []

        print("\n" + "=" * 60)
        print("クラスタごとのリレーション抽出")
        print("=" * 60)

        # 処理対象のクラスタを決定
        if target_cluster_ids is not None:
            clusters_to_process = [c for c in sorted(self.clusters) if c in target_cluster_ids]
            print(f"対象クラスタ: {clusters_to_process}")
        else:
            clusters_to_process = sorted(self.clusters)

        for cluster_id in clusters_to_process:
            print(f"\nクラスタ {cluster_id} を処理中...")
            cluster_intents = self.df[self.df['cluster'] == cluster_id]

            if len(cluster_intents) < 2:
                print(f"  ⚠️  スキップ（インテント数: {len(cluster_intents)}）")
                cluster_relations[int(cluster_id)] = []
                continue

            result = self._extract_goal_means_relations(cluster_intents)
            relations = result['relations']
            generated_nodes = result['generated_nodes']

            cluster_relations[int(cluster_id)] = relations

            # generated_nodes にクラスタIDを追加
            for node in generated_nodes:
                node['cluster'] = int(cluster_id)
            all_generated_nodes.extend(generated_nodes)

            print(f"  ✓ {len(relations)}件のリレーション、{len(generated_nodes)}件のgenerated nodeを抽出")

        # 保存
        output_path = OUTPUT_DIR / "cluster_relations.json"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(cluster_relations, f, ensure_ascii=False, indent=2)
        print(f"\n💾 クラスタリレーションを保存: {output_path}")

        # generated_nodesも保存
        if all_generated_nodes:
            gen_output_path = OUTPUT_DIR / "cluster_generated_nodes.json"
            with open(gen_output_path, 'w', encoding='utf-8') as f:
                json.dump(all_generated_nodes, f, ensure_ascii=False, indent=2)
            print(f"💾 Generated nodesを保存: {gen_output_path} ({len(all_generated_nodes)}件)")

        return cluster_relations

    def extract_hub_intents(self, cluster_relations: Dict[int, List[Dict]]) -> List[Dict]:
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
        intent_as_goal_count = {}

        for cluster_id, relations in cluster_relations.items():
            for rel in relations:
                # "to"が目的、"from"が手段
                to_intent_id = rel['to']
                intent_as_goal_count[to_intent_id] = intent_as_goal_count.get(to_intent_id, 0) + 1

        # クラスタごとにハブIntentを選択
        hub_intents = []

        # cluster_relationsに含まれるクラスタのみ処理
        target_clusters = sorted([int(c) for c in cluster_relations.keys()])
        print(f"対象クラスタ: {target_clusters}")

        for cluster_id in target_clusters:
            cluster_intents = self.df[self.df['cluster'] == cluster_id]
            cluster_intent_ids = cluster_intents['intent_id'].tolist()

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
                intent_row = self.df[self.df['intent_id'] == hub_intent_id].iloc[0]
                hub_intents.append({
                    'intent_id': hub_intent_id,
                    'cluster': int(cluster_id),
                    'intent': intent_row['intent'],
                    'hub_score': max_score
                })
                print(f"  クラスタ {cluster_id}: {hub_intent_id} (score: {max_score})")

        # 保存
        output_path = OUTPUT_DIR / "hub_intents.json"
        with open(output_path, 'w', encoding='utf-8') as f:
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

        if len(hub_intents) < 2:
            print("  ⚠️  ハブIntentが不足（2件未満）")
            # 空のファイルを保存
            output_path = OUTPUT_DIR / "hub_relations.json"
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False, indent=2)
            print(f"💾 ハブリレーションを保存: {output_path}")
            return []

        # ハブIntentをDataFrameに変換
        hub_df = pd.DataFrame(hub_intents)

        # リレーション抽出
        result = self._extract_goal_means_relations(hub_df, use_intent_id=True)
        relations = result['relations']
        generated_nodes = result['generated_nodes']

        # 保存
        output_path = OUTPUT_DIR / "hub_relations.json"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(relations, f, ensure_ascii=False, indent=2)
        print(f"\n💾 ハブリレーションを保存: {output_path}")
        print(f"✓ {len(relations)}件のリレーション、{len(generated_nodes)}件のgenerated nodeを抽出")

        # hub generated_nodesも保存
        if generated_nodes:
            gen_output_path = OUTPUT_DIR / "hub_generated_nodes.json"
            with open(gen_output_path, 'w', encoding='utf-8') as f:
                json.dump(generated_nodes, f, ensure_ascii=False, indent=2)
            print(f"💾 Hub generated nodesを保存: {gen_output_path}")

        return relations

    def _extract_goal_means_relations(
        self,
        intents_df: pd.DataFrame,
        use_intent_id: bool = False
    ) -> List[Dict]:
        """
        LLMを使用して目的→手段リレーションを抽出

        Args:
            intents_df: インテントのDataFrame
            use_intent_id: Trueの場合、返り値にintent_idを使用

        Returns:
            [{"from": id, "to": id, "type": "goal-means"}, ...]
        """
        # Intentリストを整形
        intents_list = []
        for i, (idx, row) in enumerate(intents_df.iterrows()):
            if use_intent_id and 'intent_id' in intents_df.columns:
                intent_id = row['intent_id']
            else:
                intent_id = row['intent_id'] if 'intent_id' in intents_df.columns else f"intent_{i}"

            intents_list.append({
                'id': intent_id,
                'text': row['intent']
            })

        # プロンプト作成（新形式: {} プロパティ記法）
        intents_text = "\n".join([
            f"{i+1}. {intent['text']} {{intent=\"{intent['text']}\" id={intent['id']}}}"
            for i, intent in enumerate(intents_list)
        ])

        # テンプレート読み込み
        template_path = TEMPLATE_DIR / "goal_network_extraction_prompt.md"
        with open(template_path, 'r', encoding='utf-8') as f:
            prompt_template = f.read()

        # プレースホルダーを置換（.format()ではなく.replace()を使用）
        prompt = prompt_template.replace("{intents_text}", intents_text)

        try:
            # Gemini API呼び出し
            model = gemini_client.GenerativeModel()
            response = model.generate_content(prompt)

            # Markdownリストをパース
            response_text = response.text.strip()

            # Markdownコードブロックを除去
            if response_text.startswith("```markdown"):
                response_text = response_text.replace("```markdown", "").replace("```", "").strip()
            elif response_text.startswith("```"):
                response_text = response_text.replace("```", "").strip()

            # リレーションとノード情報を抽出（多階層対応）
            relations = []
            generated_nodes = []
            import re

            # 各行のインデントレベルとIntent IDを抽出
            lines_with_level = []
            for line in response_text.split('\n'):
                line_stripped = line.rstrip()
                if not line_stripped or not line_stripped.lstrip().startswith(('-', '*')):
                    continue

                # インデントレベルを計算（2スペースごとに1レベル）
                indent = len(line) - len(line.lstrip())
                level = indent // 2

                # Intent IDを抽出（新形式: {... id=intent_XXXXX or id=generated_XXX ...}）
                match_id = re.search(r'\{[^}]*id=(intent_\d+|generated_\d+)[^}]*\}', line_stripped)
                intent_id = match_id.group(1) if match_id else None

                # generated_XXX の場合、ノード情報を抽出
                if intent_id and intent_id.startswith('generated_'):
                    # intentテキストを抽出
                    match_intent = re.search(r'intent="([^"]*)"', line_stripped)
                    intent_text = match_intent.group(1) if match_intent else ""

                    # statusを抽出
                    match_status = re.search(r'status=(\w+)', line_stripped)
                    status = match_status.group(1) if match_status else "idea"

                    # contextを抽出（任意）
                    match_context = re.search(r'context="([^"]*)"', line_stripped)
                    context = match_context.group(1) if match_context else ""

                    # objective_factsを抽出（任意）
                    match_facts = re.search(r'objective_facts="([^"]*)"', line_stripped)
                    objective_facts = match_facts.group(1) if match_facts else ""

                    generated_nodes.append({
                        'intent_id': intent_id,
                        'intent': intent_text,
                        'status': status,
                        'context': context,
                        'objective_facts': objective_facts
                    })

                lines_with_level.append({
                    'level': level,
                    'intent_id': intent_id,
                    'text': line_stripped
                })

            # 階層構造をたどってリレーションを構築
            # 各ノードの親を探す（上位レベルで最も近いIntent IDを持つノード）
            for i, current in enumerate(lines_with_level):
                if current['intent_id'] is None:
                    continue

                # 親を探す（上位レベルで最も近いIntent IDを持つノード）
                # IDのない抽象ノードはスキップして、その上の親を探す
                parent_id = None
                for j in range(i - 1, -1, -1):
                    # より上位のレベル（数値が小さい）で、Intent IDを持つノードを探す
                    if lines_with_level[j]['level'] < current['level']:
                        if lines_with_level[j]['intent_id']:
                            parent_id = lines_with_level[j]['intent_id']
                            break

                # 親が見つかった場合、リレーションを追加
                if parent_id:
                    relations.append({
                        'from': current['intent_id'],
                        'to': parent_id,
                        'type': 'goal-means'
                    })

            # 結果を返す
            return {
                'relations': relations,
                'generated_nodes': generated_nodes
            }

        except Exception as e:
            print(f"  ❌ エラー: {e}")
            import traceback
            traceback.print_exc()
            return {'relations': [], 'generated_nodes': []}


def main():
    """メイン処理"""
    import argparse

    parser = argparse.ArgumentParser(description='ゴールネットワーク構築')
    parser.add_argument(
        '--input',
        type=str,
        default='output/intent_clustering/clustered_intents.csv',
        help='クラスタリング結果CSVのパス'
    )
    parser.add_argument(
        '--cluster-id',
        type=int,
        action='append',
        help='処理対象のクラスタID（複数指定可能、未指定の場合は全クラスタ）'
    )

    args = parser.parse_args()

    print("=" * 60)
    print("ゴールネットワーク構築")
    print("=" * 60)

    # ネットワーク構築
    builder = GoalNetworkBuilder(args.input)

    # B: クラスタごとのリレーション抽出
    cluster_relations = builder.build_cluster_relations(target_cluster_ids=args.cluster_id)

    # C: ハブIntent抽出
    hub_intents = builder.extract_hub_intents(cluster_relations)

    # D: ハブIntent間リレーション構築
    hub_relations = builder.build_hub_relations(hub_intents)

    print("\n" + "=" * 60)
    print("✅ 完了！")
    print("=" * 60)
    print(f"📁 出力ディレクトリ: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
