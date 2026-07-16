"""user email_verified flag

Revision ID: d8e2b5c91f47
Revises: c1f4a8d27e93
Create Date: 2026-07-15 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd8e2b5c91f47'
down_revision: str | None = 'c1f4a8d27e93'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('email_verified', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )


def downgrade() -> None:
    op.drop_column('users', 'email_verified')
