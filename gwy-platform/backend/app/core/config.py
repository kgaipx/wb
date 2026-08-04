"""全局配置：从环境变量 / .env 读取（pydantic-settings）。

所有敏感配置通过环境变量注入，禁止硬编码密钥（合规要求）。
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    APP_NAME: str = "AI公务员考前培训学习平台"
    APP_ENV: str = "development"
    SECRET_KEY: str = "change_me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # 数据库
    DATABASE_URL: str = (
        "mysql+pymysql://gwy:gwy_dev_pass@127.0.0.1:3306/gwy_platform?charset=utf8mb4"
    )

    # Redis
    REDIS_URL: str = "redis://127.0.0.1:6379/0"

    # LLM
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = ""
    LLM_MODEL: str = ""
    LLM_FALLBACK_MODEL: str = ""

    # 向量库
    VECTOR_DB_URL: str = "http://127.0.0.1:19530"
    EMBEDDING_MODEL: str = ""

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173"


settings = Settings()
