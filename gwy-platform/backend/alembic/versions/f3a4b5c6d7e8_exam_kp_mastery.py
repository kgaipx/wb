"""exam_records: add kp_mastery column

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-08-08 21:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'exam_records',
        sa.Column(
            'kp_mastery',
            sa.JSON(),
            nullable=True,
            server_default='[]',
            comment='各知识点「模考前→模考后」掌握度变化 JSON 数组',
        ),
    )


def downgrade() -> None:
    op.drop_column('exam_records', 'kp_mastery')
