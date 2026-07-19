from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/cyoa"

    @field_validator("database_url")
    @classmethod
    def force_asyncpg_driver(cls, v: str) -> str:
        # tolerate plain postgres URLs (k3s secrets, old .env files)
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    llm_max_attempts: int = 3
    static_dir: str = ""
    # signs auth JWTs; register/login are disabled while unset
    jwt_secret: str = ""
    # this email gets the admin role on register/login (the sole admin for now)
    admin_email: str = ""
    # iOS bundle id, the audience of Apple identity tokens; Sign in with Apple is
    # disabled while unset
    apple_bundle_id: str = ""
    # Resend (https://resend.com); emails are logged instead of sent while unset
    resend_api_key: str = ""
    email_from: str = "Scenario Sim <noreply@byah.org>"
    # base URL used in links inside emails (prod: https://game-theory.byah.org)
    app_base_url: str = "http://localhost:5173"
    # Docker/CI supplies these for application_build_info; local runs use package metadata.
    application_version: str = ""
    git_sha: str = "unknown"


@lru_cache
def get_settings() -> Settings:
    return Settings()
