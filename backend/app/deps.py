import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import AnonSession, User
from app.services import auth

SESSION_COOKIE = "cyoa_session"


def _bearer_identity(request: Request) -> tuple[str, uuid.UUID] | None:
    """The parsed bearer token: ("user", user_id) or ("guest", session_id), else None.

    An invalid or expired token degrades to anonymous rather than failing the request —
    strict endpoints (auth/me, admin) use current_user, which does 401.
    """
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    return auth.parse_token(header[7:].strip())


async def _user_from_token(request: Request, db: AsyncSession) -> User | None:
    identity = _bearer_identity(request)
    if identity is None or identity[0] != "user":
        return None
    return await db.get(User, identity[1])


async def current_session_id(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> uuid.UUID:
    """The identity every ownership FK hangs off.

    Account bearer tokens resolve to the user's own session row, so their content
    follows them across devices. Guest bearer tokens (native apps, POST /api/auth/guest)
    carry the session id directly. Browser guests get the anonymous cookie flow: a uuid4
    cookie backed by an anon_sessions row. In every case possession of the credential is
    the whole identity; accounts are optional.
    """
    identity = _bearer_identity(request)
    if identity is not None:
        kind, ident = identity
        if kind == "user":
            user = await db.get(User, ident)
            if user is not None:
                return user.session_id
        else:
            exists = await db.scalar(select(AnonSession.id).where(AnonSession.id == ident))
            if exists is not None:
                return ident

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


async def current_user(
    request: Request, db: Annotated[AsyncSession, Depends(get_db)]
) -> User:
    user = await _user_from_token(request, db)
    if user is None:
        raise HTTPException(status_code=401, detail="not signed in")
    return user


async def require_admin(user: Annotated[User, Depends(current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="admin access required")
    return user


SessionId = Annotated[uuid.UUID, Depends(current_session_id)]
CurrentUser = Annotated[User, Depends(current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]
