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

    # 数据库：开发期默认 SQLite（零外部依赖，便于本地验证）；生产请通过环境变量覆盖为 MySQL。
    # 例：DATABASE_URL=mysql+pymysql://user:pass@host:3306/gwy_platform?charset=utf8mb4
    DATABASE_URL: str = "sqlite:///./gwy_dev.db"

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

    # 免费版每日 AI 逐题讲解配额（防滥用；pro/pro_year 不限）
    FREE_AI_EXPLAIN_QUOTA: int = 20

    # 初始管理员引导（仅 ADMIN_EMAIL/ADMIN_PASSWORD 均在 .env 中设置时，
    # 启动期幂等创建 role=admin 账号，用于内容双签复核与运营后台）。
    # 注意：字段必须在此声明，否则 extra="ignore" 会丢弃 .env 中的未知键，
    # 导致 _ensure_admin() 读不到环境变量。
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

    # 支付：沙箱模式（自托管/演示用，可模拟支付回调）；接真实微信/支付宝时置 False。
    # 生产回调校验令牌（PAYMENT_NOTIFY_SECRET），由支付 provider 回调时携带以验真。
    PAYMENT_SANDBOX: bool = True
    PAYMENT_NOTIFY_SECRET: str = ""

    # 邮件（账号找回）：未配置 SMTP_HOST 时进入开发模式，接口直接返回重置令牌，便于自托管演示。
    SMTP_HOST: str = ""
    SMTP_PORT: int = 465
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_SENDER: str = "noreply@gwy.example"


settings = Settings()
