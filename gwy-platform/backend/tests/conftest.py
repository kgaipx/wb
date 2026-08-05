"""pytest 固定装置：独立临时 SQLite + 关闭 LLM 联网，保证测试可离线、可重复运行。

测试库与开发库（gwy_dev.db）完全隔离；lifespan 会在 TestClient 进入时自动建表并注入
平台原创示范题，使 /exam、/student 等依赖题库的用例开箱即用。
"""
import os
import tempfile

import pytest

# 必须在 import app 之前设置环境变量（config / engine 在导入时即读取）
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["APP_ENV"] = "test"
os.environ["CORS_ORIGINS"] = "*"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["LLM_API_KEY"] = ""
os.environ["LLM_BASE_URL"] = ""
os.environ["LLM_MODEL"] = ""

from fastapi.testclient import TestClient  # noqa: E402

import app.main as main_mod  # noqa: E402
import app.middleware as _mw  # noqa: E402


# 测试套件内放宽认证限流阈值：全链路约 20+ 次 register，默认 10/min 会误伤。
# 限流行为由 test_auth_rate_limit 单独、在受控窗口内验证（临时还原阈值）。
_mw.AUTH_LIMIT = 10_000_000


@pytest.fixture(scope="session")
def client():
    with TestClient(main_mod.app) as c:
        yield c
