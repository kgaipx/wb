"""add assessment_records

Revision ID: add0aef0c1d2
Revises: 0a85fdf05a04
Create Date: 2026-08-05 19:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add0aef0c1d2'
down_revision: Union[str, None] = '0a85fdf05a04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('assessment_records',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False, comment='测评用户'),
        sa.Column('overall', sa.Float(), nullable=False, comment='总体掌握度 0-1'),
        sa.Column('mastery_json', sa.Text(), nullable=False, comment='JSON: [{kp, mastery}] 各维度本次正确率'),
        sa.Column('weak_json', sa.Text(), nullable=False, comment='JSON: 弱项知识点列表'),
        sa.Column('suggestions_json', sa.Text(), nullable=False, comment='JSON: 提升建议列表'),
        sa.Column('questions_total', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_assessment_records_user_id'), 'assessment_records', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_assessment_records_user_id'), table_name='assessment_records')
    op.drop_table('assessment_records')
