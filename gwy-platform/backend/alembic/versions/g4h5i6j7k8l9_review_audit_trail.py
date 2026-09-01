"""add reviewer signature timestamps + content_review_logs

Revision ID: g4h5i6j7k8l9
Revises: f3a4b5c6d7e8
Create Date: 2026-09-01 12:00:00.000000

双签留痕深化（c11 风险）：
- content_reviews 新增 reviewer_1_at / reviewer_2_at：每笔签名单独落时间戳
- 新增 content_review_logs 表：append-only 操作日志，submit/approve/reject/correct 全留痕
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g4h5i6j7k8l9'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('content_reviews') as batch:
        batch.add_column(sa.Column('reviewer_1_at', sa.DateTime(), nullable=True, comment='甲签时间（双签留痕）'))
        batch.add_column(sa.Column('reviewer_2_at', sa.DateTime(), nullable=True, comment='乙签时间（双签留痕）'))

    op.create_table(
        'content_review_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('review_id', sa.Integer(), nullable=False, comment='所属审核单'),
        sa.Column('action', sa.String(length=16), nullable=False, comment='submit / approve / reject / correct'),
        sa.Column('actor', sa.String(length=64), nullable=False, comment='操作人（昵称或邮箱）'),
        sa.Column('note', sa.Text(), nullable=True, comment='备注/驳回理由/更正说明'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_content_review_logs_review_id'), 'content_review_logs', ['review_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_content_review_logs_review_id'), table_name='content_review_logs')
    op.drop_table('content_review_logs')
    with op.batch_alter_table('content_reviews') as batch:
        batch.drop_column('reviewer_2_at')
        batch.drop_column('reviewer_1_at')