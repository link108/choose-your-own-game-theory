"""context-enabled scenarios and playthrough context

Revision ID: e4a8c1d29f73
Revises: f2b6d4a81c59
Create Date: 2026-07-16 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e4a8c1d29f73"
down_revision: str | None = "f2b6d4a81c59"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_COL = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.add_column(
        "scenarios",
        sa.Column("context_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "scenarios", sa.Column("context_prompt", sa.Text(), nullable=False, server_default="")
    )
    op.add_column(
        "scenarios",
        sa.Column("context_disclaimer", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "scenarios",
        sa.Column("risk_domain", sa.String(length=20), nullable=False, server_default="general"),
    )
    op.add_column("playthroughs", sa.Column("user_context", JSON_COL, nullable=True))
    op.add_column(
        "playthroughs",
        sa.Column("context_summary", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("playthroughs", "context_summary")
    op.drop_column("playthroughs", "user_context")
    op.drop_column("scenarios", "risk_domain")
    op.drop_column("scenarios", "context_disclaimer")
    op.drop_column("scenarios", "context_prompt")
    op.drop_column("scenarios", "context_enabled")
