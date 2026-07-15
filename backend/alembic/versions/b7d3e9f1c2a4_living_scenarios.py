"""living scenarios: is_living flag, playthrough snapshots, scenario_updates table

Revision ID: b7d3e9f1c2a4
Revises: 779257e57d84
Create Date: 2026-07-15 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'b7d3e9f1c2a4'
down_revision: str | None = '779257e57d84'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSON_COL = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')


def upgrade() -> None:
    op.add_column(
        'scenarios',
        sa.Column('is_living', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index('ix_scenarios_is_living', 'scenarios', ['is_living'])

    op.add_column('playthroughs', sa.Column('scenario_snapshot', JSON_COL, nullable=True))

    op.create_table(
        'scenario_updates',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('scenario_id', sa.Uuid(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('headline', sa.String(length=300), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('changes', sa.Text(), nullable=False),
        sa.Column('sources', JSON_COL, nullable=False),
        sa.Column('proposed', JSON_COL, nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['scenario_id'], ['scenarios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_scenario_updates_scenario_id', 'scenario_updates', ['scenario_id'])
    op.create_index('ix_scenario_updates_status', 'scenario_updates', ['status'])


def downgrade() -> None:
    op.drop_table('scenario_updates')
    op.drop_column('playthroughs', 'scenario_snapshot')
    op.drop_index('ix_scenarios_is_living', table_name='scenarios')
    op.drop_column('scenarios', 'is_living')
