"""scenario insights

Revision ID: f2b6d4a81c59
Revises: d8e2b5c91f47
Create Date: 2026-07-16 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'f2b6d4a81c59'
down_revision: str | None = 'd8e2b5c91f47'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'scenario_insights',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('scenario_id', sa.Uuid(), nullable=False),
        sa.Column('owner_session_id', sa.Uuid(), nullable=False),
        sa.Column('runs_analyzed', sa.Integer(), nullable=False),
        sa.Column(
            'insight',
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'),
            nullable=False,
        ),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['scenario_id'], ['scenarios.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['owner_session_id'], ['anon_sessions.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'scenario_id', 'owner_session_id', name='uq_insight_scenario_session'
        ),
    )
    op.create_index(
        op.f('ix_scenario_insights_scenario_id'), 'scenario_insights', ['scenario_id']
    )
    op.create_index(
        op.f('ix_scenario_insights_owner_session_id'),
        'scenario_insights',
        ['owner_session_id'],
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_scenario_insights_owner_session_id'), table_name='scenario_insights')
    op.drop_index(op.f('ix_scenario_insights_scenario_id'), table_name='scenario_insights')
    op.drop_table('scenario_insights')
