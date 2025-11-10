WITH RECURSIVE line_hierarchy AS (
    SELECT id, name, parent_line_id, name::text AS full_path
    FROM lines
    WHERE parent_line_id IS NULL

    UNION ALL

    SELECT l.id, l.name, l.parent_line_id, lh.full_path || ' -> ' || l.name
    FROM lines l
    JOIN line_hierarchy lh ON l.parent_line_id = lh.id
),
msg_filtered AS (
    SELECT
        m.*,
        lh.full_path,
        mt.meta_text,
        -- 各行ごとの表示用文字列を作成
        CASE
            WHEN m.type = 'task' THEN
                -- 完了フラグを日本語にマップして type と結合
                m.content || ' - ' ||
                m.type || ' - ' ||
                CASE
                    WHEN lower(coalesce(m.metadata->>'completed','')) IN ('t','true','1','yes') THEN '完了'
                    WHEN coalesce(m.metadata->>'completed','') = '' THEN '不明'
                    ELSE '未完了'
                END
            WHEN m.type = 'document' THEN
                -- document は type + content の先頭30文字
                m.type || ' - ' || coalesce(left(m.content, 30), '')
            ELSE
                -- それ以外は content + top-level metadata 表示（meta_text があれば付加）
                coalesce(left(m.content, 200), '')
        END AS display_text
    FROM messages m
    JOIN line_hierarchy lh ON m.line_id = lh.id

    -- top-levelキーを "k: v" 形式で結合（NULLならNULL）
    LEFT JOIN LATERAL (
        SELECT string_agg(k || ': ' || v, ', ' ORDER BY k) AS meta_text
        FROM jsonb_each_text(m.metadata) AS t(k, v)
    ) mt ON true

    -- ここでは document も含める（type ごとに処理するため）
    WHERE type IS NOT NULL
      AND deleted != 't'
      AND length(m.content) >= 7
),
msg_with_gap AS (
    SELECT
        *,
        lag(timestamp) OVER (PARTITION BY line_id ORDER BY timestamp) AS prev_ts
    FROM msg_filtered
),
msg_group AS (
    SELECT
        *,
        SUM(
            CASE WHEN prev_ts IS NULL OR timestamp - prev_ts > interval '30 minutes' THEN 1 ELSE 0 END
        ) OVER (PARTITION BY line_id ORDER BY timestamp) AS grp
    FROM msg_with_gap
)

SELECT
    full_path,
    to_char(date_trunc('minute', MIN(timestamp)), 'YYYY-MM-DD HH24:MI') AS start_time,
    to_char(date_trunc('minute', MAX(timestamp)), 'YYYY-MM-DD HH24:MI') AS end_time,
    -- display_text を時系列で結合
    string_agg(display_text, E'\n' ORDER BY timestamp) AS combined_content
FROM msg_group
GROUP BY line_id, full_path, grp
ORDER BY full_path, start_time DESC;