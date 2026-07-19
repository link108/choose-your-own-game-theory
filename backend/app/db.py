import time
from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings
from app.metrics import DATABASE_QUERY_DURATION


class Base(DeclarativeBase):
    pass


engine = create_async_engine(get_settings().database_url)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


def _database_operation(context) -> str:
    if context.isinsert:
        return "insert"
    if context.isupdate:
        return "update"
    if context.isdelete:
        return "delete"
    if context.compiled is not None:
        return "select"
    return "other"


@event.listens_for(engine.sync_engine, "before_cursor_execute")
def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    context._metrics_started_at = time.perf_counter()


def _observe_database_query(context) -> None:
    started_at = getattr(context, "_metrics_started_at", None)
    if started_at is not None:
        DATABASE_QUERY_DURATION.labels(_database_operation(context)).observe(
            time.perf_counter() - started_at
        )


@event.listens_for(engine.sync_engine, "after_cursor_execute")
def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    _observe_database_query(context)


@event.listens_for(engine.sync_engine, "handle_error")
def _handle_database_error(exception_context):
    if exception_context.execution_context is not None:
        _observe_database_query(exception_context.execution_context)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
