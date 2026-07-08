import uuid
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import AnonSession

SESSION_COOKIE = "cyoa_session"


async def current_session_id(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> uuid.UUID:
    """Anonymous identity: a uuid4 cookie backed by an anon_sessions row.

    uuid4 is unguessable, so possession of the cookie is the whole credential.
    A users table can later hang off anon_sessions without touching ownership FKs.
    """
    raw = request.cookies.get(SESSION_COOKIE)
    session_id: uuid.UUID | None = None
    if raw:
        try:
            session_id = uuid.UUID(raw)
        except ValueError:
            session_id = None

    if session_id is not None:
        existing = await db.scalar(select(AnonSession.id).where(AnonSession.id == session_id))
        if existing is not None:
            return session_id

    session_id = uuid.uuid4()
    db.add(AnonSession(id=session_id))
    await db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        str(session_id),
        max_age=60 * 60 * 24 * 365,
        httponly=True,
        samesite="lax",
    )
    return session_id


SessionId = Annotated[uuid.UUID, Depends(current_session_id)]
DB = Annotated[AsyncSession, Depends(get_db)]
