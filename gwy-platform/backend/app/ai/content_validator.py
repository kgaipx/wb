"""内容校验管道（方案 c5 方向5、WBS 5.2、c11 P0 风险）。

职责：
- 双签校验：AI 生成 / 入库的题库、时政、政策内容须人工复核
- 抽检 ≥99%：定期抽检保证准确性（回应华图教材事故）
- 版本留痕 + 更正通知：内容变更可追溯，错误时主动通知受影响的学员

这是「信任保障」方向的技术底座，与方案 c10 合规直接对应。
"""
from dataclasses import dataclass
from enum import Enum


class ReviewStatus(str, Enum):
    PENDING = "pending"      # 待复核
    APPROVED = "approved"    # 双签通过
    REJECTED = "rejected"    # 驳回
    CORRECTED = "corrected"  # 已更正并通知


@dataclass
class ContentItem:
    item_id: str
    body: str
    source: str          # 来源标注（版权/政策溯源）
    version: int = 1
    status: ReviewStatus = ReviewStatus.PENDING


class ContentValidator:
    # 抽检比例下限（方案 c11 应对：抽检 ≥99%）
    SAMPLE_RATE = 0.99

    def submit_for_review(self, item: ContentItem) -> None:
        """提交内容进入双签复核流程。"""
        # TODO(WBS 5.2): 接审核工作流 + 双人复核
        item.status = ReviewStatus.PENDING

    def approve(self, item: ContentItem, reviewer: str) -> None:
        """双签通过（需两名审核员）。"""
        # TODO(WBS 5.2): 记录审核员 + 时间戳留痕
        item.status = ReviewStatus.APPROVED

    def correct_and_notify(self, item: ContentItem, new_body: str) -> None:
        """更正内容并通知受影响学员（版本留痕）。"""
        item.body = new_body
        item.version += 1
        item.status = ReviewStatus.CORRECTED
        # TODO(WBS 5.2): 推送更正通知到相关学情记录
