"""add playthrough analysis

Revision ID: a41f9c2d5e83
Revises: 78c60dd8d971
Create Date: 2026-07-14 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'a41f9c2d5e83'
down_revision: str | None = '78c60dd8d971'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'playthroughs',
        sa.Column(
            'analysis',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column('playthroughs', 'analysis')
