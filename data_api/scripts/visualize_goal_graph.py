#!/usr/bin/env python3
"""
Goal Relation Graph Visualizer

goal_relation_extraction の結果を読み込み、D3.js を使ったインタラクティブな
force-directed graph を生成する。
"""

import json
from pathlib import Path

import pandas as pd


def load_goal_data(goal_extraction_dir: Path) -> dict[str, dict]:
    """全クラスターのゴールデータを読み込み、node_id -> goal のマッピングを作成"""
    goal_map = {}

    for json_file in sorted(goal_extraction_dir.glob("cluster_*_goals.json")):
        cluster_id = json_file.stem.split("_")[1]  # "cluster_00_goals" -> "00"

        with open(json_file) as f:
            goals = json.load(f)

        for idx, goal in enumerate(goals):
            node_id = f"{cluster_id}_{idx:02d}"
            goal_map[node_id] = goal

    return goal_map


def extract_level_number(level_str: str) -> int:
    """abstraction_levelから数値を抽出 (例: "L3_プロジェクト" -> 3)"""
    try:
        return int(level_str.split("_")[0][1:])  # "L3" -> 3
    except (ValueError, IndexError):
        return 5  # デフォルトは最下位


def create_graph_data(relations_csv: Path, goal_map: dict) -> dict:
    """グラフデータをD3.js用のJSON形式に変換"""
    df = pd.read_csv(relations_csv)

    # ノード一覧を作成
    node_ids = set(df["source_node_id"]) | set(df["target_node_id"])

    nodes = []
    for node_id in sorted(node_ids):
        goal = goal_map.get(node_id, {})
        level_str = goal.get("abstraction_level", "Unknown")
        nodes.append(
            {
                "id": node_id,
                "subject": goal.get("subject", "Unknown"),
                "theme": goal.get("theme", "Unknown"),
                "level": level_str,
                "levelNum": extract_level_number(level_str),
                "cluster": node_id.split("_")[0],
            }
        )

    # エッジ一覧を作成
    links = []
    for _, row in df.iterrows():
        links.append(
            {
                "source": row["source_node_id"],
                "target": row["target_node_id"],
                "type": row["relation_type"],
                "score": float(row["score"]),
                "reason": row["reason"],
            }
        )

    return {"nodes": nodes, "links": links}


def generate_html(graph_data: dict, output_path: Path) -> None:
    """D3.js を使った可視化HTMLを生成"""
    html_template = """<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Goal Relations Graph</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body {{
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            overflow: hidden;
        }}
        #controls {{
            position: absolute;
            top: 10px;
            left: 10px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            z-index: 1000;
            max-width: 300px;
        }}
        #tooltip {{
            position: absolute;
            padding: 10px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            border-radius: 4px;
            pointer-events: none;
            opacity: 0;
            font-size: 12px;
            max-width: 400px;
            z-index: 1001;
        }}
        .filter-section {{
            margin-bottom: 10px;
        }}
        .filter-section label {{
            display: block;
            margin: 5px 0;
            font-size: 13px;
        }}
        select, input {{
            width: 100%;
            padding: 5px;
            margin-top: 3px;
        }}
        .stats {{
            font-size: 11px;
            color: #666;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #eee;
        }}
        button {{
            width: 100%;
            padding: 8px;
            margin-top: 5px;
            background: #007AFF;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }}
        button:hover {{
            background: #0051D5;
        }}
    </style>
</head>
<body>
    <div id="controls">
        <div class="filter-section">
            <label>
                Relation Type:
                <select id="relationFilter">
                    <option value="all">All</option>
                    <option value="hierarchy">Hierarchy</option>
                    <option value="means_end">Means-End</option>
                    <option value="causal">Causal</option>
                    <option value="dependency">Dependency</option>
                </select>
            </label>
        </div>
        <div class="filter-section">
            <label>
                Min Score: <span id="scoreValue">0.5</span>
                <input type="range" id="scoreFilter" min="0" max="1" step="0.01" value="0.5">
            </label>
        </div>
        <div class="filter-section">
            <label>
                Search Node:
                <input type="text" id="searchInput" placeholder="Enter node ID or keyword">
            </label>
        </div>
        <div class="filter-section">
            <label>
                N-Hop Range: <span id="nhopValue">1</span>
                <input type="range" id="nhopFilter" min="1" max="5" step="1" value="1">
            </label>
        </div>
        <button id="resetBtn">Reset View</button>
        <div class="stats">
            <div>Nodes: <span id="nodeCount">0</span></div>
            <div>Links: <span id="linkCount">0</span></div>
        </div>
    </div>
    <div id="tooltip"></div>
    <svg id="graph"></svg>

    <script>
        const graphData = {graph_json};

        const width = window.innerWidth;
        const height = window.innerHeight;

        const svg = d3.select("#graph")
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g");

        // Zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => {{
                g.attr("transform", event.transform);
            }});

        svg.call(zoom);

        // Color scales
        const relationColors = {{
            hierarchy: "#4A90E2",
            means_end: "#50C878",
            causal: "#FF6B6B",
            dependency: "#FFA500"
        }};

        const clusterColor = d3.scaleOrdinal(d3.schemeCategory10);

        // Tooltip
        const tooltip = d3.select("#tooltip");

        // Filter state
        let currentRelationType = "all";
        let currentMinScore = 0.5;
        let currentSearch = "";
        let currentNHops = 1;

        // Build adjacency map for n-hop calculation
        function buildAdjacencyMap(links) {{
            const adjacency = new Map();
            links.forEach(link => {{
                const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                const targetId = typeof link.target === 'object' ? link.target.id : link.target;

                if (!adjacency.has(sourceId)) adjacency.set(sourceId, new Set());
                if (!adjacency.has(targetId)) adjacency.set(targetId, new Set());

                adjacency.get(sourceId).add(targetId);
                adjacency.get(targetId).add(sourceId);
            }});
            return adjacency;
        }}

        // Get all nodes within n-hops from seed nodes
        function getNHopNodes(seedNodeIds, adjacency, nHops) {{
            const visited = new Set(seedNodeIds);
            let current = new Set(seedNodeIds);

            for (let i = 0; i < nHops; i++) {{
                const next = new Set();
                current.forEach(nodeId => {{
                    const neighbors = adjacency.get(nodeId) || new Set();
                    neighbors.forEach(neighbor => {{
                        if (!visited.has(neighbor)) {{
                            next.add(neighbor);
                            visited.add(neighbor);
                        }}
                    }});
                }});
                current = next;
                if (current.size === 0) break;
            }}

            return visited;
        }}

        function filterGraph() {{
            // First, filter links by relation type and score
            const filteredLinks = graphData.links.filter(d => {{
                const typeMatch = currentRelationType === "all" || d.type === currentRelationType;
                const scoreMatch = d.score >= currentMinScore;
                return typeMatch && scoreMatch;
            }});

            // Build adjacency map from filtered links
            const adjacency = buildAdjacencyMap(filteredLinks);

            // Determine which nodes match search criteria
            const searchMatchedNodes = new Set();
            if (currentSearch) {{
                graphData.nodes.forEach(d => {{
                    if (d.id.toLowerCase().includes(currentSearch.toLowerCase()) ||
                        d.subject.toLowerCase().includes(currentSearch.toLowerCase())) {{
                        searchMatchedNodes.add(d.id);
                    }}
                }});
            }}

            // Determine final active nodes
            let activeNodeIds;
            if (searchMatchedNodes.size > 0) {{
                // If there's a search, get n-hop neighborhood from matched nodes
                activeNodeIds = getNHopNodes(searchMatchedNodes, adjacency, currentNHops);
            }} else {{
                // No search: include all nodes connected by filtered links
                activeNodeIds = new Set();
                filteredLinks.forEach(d => {{
                    const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                    const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                    activeNodeIds.add(sourceId);
                    activeNodeIds.add(targetId);
                }});
            }}

            // Filter nodes and links based on active nodes
            const filteredNodes = graphData.nodes.filter(d => activeNodeIds.has(d.id));
            const finalLinks = filteredLinks.filter(d => {{
                const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                return activeNodeIds.has(sourceId) && activeNodeIds.has(targetId);
            }});

            console.log('Filtered:', filteredNodes.length, 'nodes,', finalLinks.length, 'links');
            updateGraph(filteredNodes, finalLinks);
        }}

        function updateGraph(nodes, links) {{
            // Update stats
            d3.select("#nodeCount").text(nodes.length);
            d3.select("#linkCount").text(links.length);

            // Clear existing
            g.selectAll("*").remove();

            // Create simulation with hierarchical layout
            // レベルごとの高さを計算 (L1が上、L5が下)
            const levelHeight = height / 6;  // 5レベル + マージン
            const getYPosition = (levelNum) => levelHeight * levelNum;

            const simulation = d3.forceSimulation(nodes)
                .force("link", d3.forceLink(links)
                    .id(d => d.id)
                    .distance(d => 100 * (1 - d.score)))
                .force("charge", d3.forceManyBody().strength(-200))
                .force("x", d3.forceX(width / 2).strength(0.05))
                .force("y", d3.forceY(d => getYPosition(d.levelNum)).strength(0.8))
                .force("collision", d3.forceCollide().radius(20));

            // Level guides (horizontal lines and labels)
            const levelLabels = [
                {{ level: 1, label: "L1: 人生目的" }},
                {{ level: 2, label: "L2: 大目標" }},
                {{ level: 3, label: "L3: プロジェクト" }},
                {{ level: 4, label: "L4: サブゴール" }},
                {{ level: 5, label: "L5: タスク" }}
            ];

            const levelGuides = g.append("g").attr("class", "level-guides");

            levelLabels.forEach(({{ level, label }}) => {{
                const y = getYPosition(level);

                // Horizontal guide line
                levelGuides.append("line")
                    .attr("x1", 0)
                    .attr("x2", width)
                    .attr("y1", y)
                    .attr("y2", y)
                    .attr("stroke", "#ddd")
                    .attr("stroke-width", 1)
                    .attr("stroke-dasharray", "5,5");

                // Level label
                levelGuides.append("text")
                    .attr("x", 10)
                    .attr("y", y - 10)
                    .attr("font-size", 14)
                    .attr("font-weight", "bold")
                    .attr("fill", "#666")
                    .text(label);
            }});

            // Links
            const link = g.append("g")
                .selectAll("line")
                .data(links)
                .join("line")
                .attr("stroke", d => relationColors[d.type])
                .attr("stroke-opacity", 0.6)
                .attr("stroke-width", d => Math.sqrt(d.score) * 2);

            // Nodes
            const node = g.append("g")
                .selectAll("circle")
                .data(nodes)
                .join("circle")
                .attr("r", 6)
                .attr("fill", d => clusterColor(d.cluster))
                .attr("stroke", "#fff")
                .attr("stroke-width", 1.5)
                .call(drag(simulation));

            // Node labels (show on hover or for highlighted nodes)
            const labels = g.append("g")
                .selectAll("text")
                .data(nodes.filter(d =>
                    currentSearch &&
                    (d.id.toLowerCase().includes(currentSearch.toLowerCase()) ||
                     d.subject.toLowerCase().includes(currentSearch.toLowerCase()))
                ))
                .join("text")
                .text(d => d.id)
                .attr("font-size", 10)
                .attr("dx", 8)
                .attr("dy", 3);

            // Hover events
            node.on("mouseover", (event, d) => {{
                tooltip
                    .style("opacity", 1)
                    .html(`
                        <strong>${{d.id}}</strong><br/>
                        Subject: ${{d.subject}}<br/>
                        Theme: ${{d.theme}}<br/>
                        Level: ${{d.level}}<br/>
                        Cluster: ${{d.cluster}}
                    `)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            }})
            .on("mouseout", () => {{
                tooltip.style("opacity", 0);
            }});

            link.on("mouseover", (event, d) => {{
                tooltip
                    .style("opacity", 1)
                    .html(`
                        <strong>${{d.type}}</strong><br/>
                        Score: ${{d.score.toFixed(3)}}<br/>
                        ${{d.reason}}
                    `)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px");
            }})
            .on("mouseout", () => {{
                tooltip.style("opacity", 0);
            }});

            // Update positions on simulation tick
            simulation.on("tick", () => {{
                link
                    .attr("x1", d => d.source.x)
                    .attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x)
                    .attr("y2", d => d.target.y);

                node
                    .attr("cx", d => d.x)
                    .attr("cy", d => d.y);

                labels
                    .attr("x", d => d.x)
                    .attr("y", d => d.y);
            }});
        }}

        function drag(simulation) {{
            function dragstarted(event) {{
                if (!event.active) simulation.alphaTarget(0.3).restart();
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }}

            function dragged(event) {{
                event.subject.fx = event.x;
                event.subject.fy = event.y;
            }}

            function dragended(event) {{
                if (!event.active) simulation.alphaTarget(0);
                event.subject.fx = null;
                event.subject.fy = null;
            }}

            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        }}

        // Event listeners
        d3.select("#relationFilter").on("change", (event) => {{
            currentRelationType = event.target.value;
            filterGraph();
        }});

        d3.select("#scoreFilter").on("input", (event) => {{
            currentMinScore = +event.target.value;
            d3.select("#scoreValue").text(currentMinScore.toFixed(2));
            filterGraph();
        }});

        d3.select("#searchInput").on("input", (event) => {{
            currentSearch = event.target.value;
            filterGraph();
        }});

        d3.select("#nhopFilter").on("input", (event) => {{
            currentNHops = +event.target.value;
            d3.select("#nhopValue").text(currentNHops);
            filterGraph();
        }});

        d3.select("#resetBtn").on("click", () => {{
            svg.transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity
            );
        }});

        // Initial render
        filterGraph();
    </script>
</body>
</html>
"""

    html_content = html_template.format(graph_json=json.dumps(graph_data, ensure_ascii=False, indent=2))

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)


def main() -> None:
    """メイン処理"""
    project_root = Path(__file__).parent.parent
    goal_extraction_dir = project_root / "output" / "goal_extraction" / "processed"
    relations_csv = project_root / "output" / "goal_relation_extraction" / "goal_relations.csv"
    output_html = project_root / "output" / "goal_relation_extraction" / "graph_visualization.html"

    print(f"Loading goal data from {goal_extraction_dir}...")
    goal_map = load_goal_data(goal_extraction_dir)
    print(f"Loaded {len(goal_map)} goals")

    print(f"Loading relations from {relations_csv}...")
    graph_data = create_graph_data(relations_csv, goal_map)
    print(f"Graph: {len(graph_data['nodes'])} nodes, {len(graph_data['links'])} links")

    print(f"Generating HTML to {output_html}...")
    generate_html(graph_data, output_html)
    print(f"✓ Visualization saved to {output_html}")
    print(f"\nOpen in browser: file://{output_html.resolve()}")


if __name__ == "__main__":
    main()
