"""auto audit status + question audit actions

Revision ID: i6j7k8l9m0n1
Revises: g4h5i6j7k8l9
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "i6j7k8l9m0n1"
down_revision = "g4h5i6j7k8l9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column(
            "audit_status",
            sa.String(16),
            nullable=False,
            server_default="pending",
            comment="程序自动识别处置状态：pending 待处置 / fixed 已修正 / voided 已作废 / ignored 已忽略",
        ),
    )
    op.create_index(
        "ix_questions_audit_status", "questions", ["audit_status"]
    )
    op.create_table(
        "question_audit_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("question_id", sa.Integer(), sa.ForeignKey("questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(16), nullable=False, comment="fixed 已修正 / voided 已作废 / ignored 已忽略"),
        sa.Column("note", sa.Text(), nullable=True, comment="处置备注"),
        sa.Column("actor", sa.String(64), nullable=False, comment="处置人（邮箱）"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_question_audit_actions_question_id", "question_audit_actions", ["question_id"])
    op.create_index("ix_question_audit_actions_created_at", "question_audit_actions", ["created_at"])


def downgrade() -> None:
    op.drop_table("question_audit_actions")
    op.drop_index("ix_questions_audit_status", table_name="questions")
    op.drop_column("questions", "audit_status")
