"""Pipeline 1: 時系列グループ化"""
from app.models import Message, MessageGroup


def run_pipeline1(messages: list[Message], threshold_minutes: int = 30) -> list[MessageGroup]:
    """
    メッセージを時系列でグループ化する

    Args:
        messages: メッセージのリスト
        threshold_minutes: グループ化の時間閾値（分）

    Returns:
        MessageGroup のリスト
    """
    if not messages:
        return []

    # タイムスタンプでソート
    sorted_messages = sorted(messages, key=lambda m: m.timestamp)

    groups: list[MessageGroup] = []
    current_group_messages: list[Message] = [sorted_messages[0]]

    for i in range(1, len(sorted_messages)):
        current_msg = sorted_messages[i]
        prev_msg = sorted_messages[i - 1]

        # 時間差を計算
        time_diff = (current_msg.timestamp - prev_msg.timestamp).total_seconds() / 60

        if time_diff <= threshold_minutes:
            # 同一グループに追加
            current_group_messages.append(current_msg)
        else:
            # 新規グループを作成
            group = _create_group(current_group_messages, len(groups))
            groups.append(group)
            current_group_messages = [current_msg]

    # 最後のグループを追加
    if current_group_messages:
        group = _create_group(current_group_messages, len(groups))
        groups.append(group)

    # グループ併合処理を適用
    groups = _merge_small_groups(groups)

    return groups


def _merge_small_groups(groups: list[MessageGroup]) -> list[MessageGroup]:
    """
    小さいグループを併合する

    ルール:
    - 前から順に走査
    - (自分の元のグループが5件未満 OR マージ後グループが10件未満) AND 次のグループも5件未満
    - この条件を満たす場合は次のグループと併合
    - 併合が発生しなくなるまで繰り返す

    Args:
        groups: MessageGroup のリスト

    Returns:
        併合後の MessageGroup のリスト
    """
    if len(groups) <= 1:
        return groups

    # 併合が発生しなくなるまで繰り返す
    while True:
        merged_groups: list[MessageGroup] = []
        merge_occurred = False
        i = 0

        while i < len(groups):
            current_group = groups[i]
            current_size = len(current_group.message_ids)

            # 次のグループが存在するかチェック
            if i + 1 < len(groups):
                next_group = groups[i + 1]
                next_size = len(next_group.message_ids)

                # マージ後のサイズ
                merged_size = current_size + next_size

                # 併合条件: (自分が5件未満 OR マージ後が10件未満) AND 次も5件未満
                should_merge = (current_size < 5 or merged_size < 10) and next_size < 5

                if should_merge:
                    # 併合: 次のグループと結合
                    merged_message_ids = current_group.message_ids + next_group.message_ids
                    merged_group = MessageGroup(
                        id=current_group.id,  # IDは後で再採番
                        message_ids=merged_message_ids,
                        start_time=current_group.start_time,
                        end_time=next_group.end_time,
                    )
                    merged_groups.append(merged_group)
                    merge_occurred = True
                    i += 2  # 2つのグループを処理したので2つ進める
                else:
                    # 併合しない: そのまま追加
                    merged_groups.append(current_group)
                    i += 1
            else:
                # 最後のグループ: そのまま追加
                merged_groups.append(current_group)
                i += 1

        # 併合が発生しなかったら終了
        if not merge_occurred:
            break

        # 次のイテレーションのために更新
        groups = merged_groups

    # group_idを再採番
    for idx, group in enumerate(groups):
        group.id = f"group_{idx:03d}"

    return groups


def _create_group(messages: list[Message], group_index: int) -> MessageGroup:
    """MessageGroup を作成"""
    group_id = f"group_{group_index:03d}"
    message_ids = [msg.id for msg in messages]
    start_time = messages[0].timestamp
    end_time = messages[-1].timestamp

    return MessageGroup(
        id=group_id,
        message_ids=message_ids,
        start_time=start_time,
        end_time=end_time,
    )
