"""refresh tokens, apple sign-in, catalog premium/featured columns

Revision ID: b3d7f5a92c61
Revises: e4a8c1d29f73
Create Date: 2026-07-17 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3d7f5a92c61"
down_revision: str | None = "e4a8c1d29f73"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("device", sa.String(length=200), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_refresh_tokens_token_hash"), "refresh_tokens", ["token_hash"], unique=True
    )
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"])

    op.add_column("users", sa.Column("apple_sub", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_users_apple_sub"), "users", ["apple_sub"], unique=True)

    op.add_column(
        "scenarios",
        sa.Column("is_premium", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("scenarios", sa.Column("featured_rank", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("scenarios", "featured_rank")
    op.drop_column("scenarios", "is_premium")
    op.drop_index(op.f("ix_users_apple_sub"), table_name="users")
    op.drop_column("users", "apple_sub")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_token_hash"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
