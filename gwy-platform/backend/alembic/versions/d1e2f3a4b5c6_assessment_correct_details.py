"""assessment_records: add correct_count and details_json

Revision ID: d1e2f3a4b5c6
Revises: b1c2d3e4f5a6
Create Date: 2026-08-07 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assessment_records', sa.Column('correct_count', sa.Integer(), nullable=True, comment='本次答对题数'))
    op.add_column('assessment_records', sa.Column('details_json', sa.Text(), nullable=True, comment='JSON: 逐题回顾明细'))


def downgrade() -> None:
    op.drop_column('assessment_records', 'details_json')
    op.drop_column('assessment_records', 'correct_count')
