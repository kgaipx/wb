"""LLM 网关（方案 c3 AI 能力层、c5 关键技术方案）。

职责：
- 统一接入国内合规大模型（混元/通义/智谱等，OpenAI 兼容协议）
- 多模型路由：按任务复杂度选择主模型，失败自动兜底
- 成本与限流：小模型优先、缓存命中、批量
- 合规留痕：记录输入输出版本，便于审计与评分一致性回溯

MVP 阶段先用占位实现，POC 时接入真实 provider。
"""
from dataclasses import dataclass
from typing import Any

from openai import OpenAI

from app.core.config import settings


@dataclass
class LLMResponse:
    content: str
    model: str
    token_usage: int = 0


class LLMGateway:
    """多模型路由 + 兜底。"""

    def __init__(self) -> None:
        self._client = OpenAI(
            api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL
        )
        self._primary = settings.LLM_MODEL
        self._fallback = settings.LLM_FALLBACK_MODEL

    def complete(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 1024,
        use_fallback: bool = True,
    ) -> LLMResponse:
        """生成补全，主模型失败时回退到 fallback。"""
        messages: list[dict[str, Any]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        try:
            return self._call(self._primary, messages, temperature, max_tokens)
        except Exception:  # noqa: BLE001 - 网关级兜底
            if use_fallback and self._fallback:
                return self._call(self._fallback, messages, temperature, max_tokens)
            raise

    def _call(self, model: str, messages: list[dict], temperature: float, max_tokens: int) -> LLMResponse:
        resp = self._client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=30,
        )
        return LLMResponse(
            content=resp.choices[0].message.content or "",
            model=model,
            token_usage=resp.usage.total_tokens if resp.usage else 0,
        )
