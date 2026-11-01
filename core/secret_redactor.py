"""
core/secret_redactor.py
Centralized secret and credential redaction engine.
"""
import re

SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key\s*[:=]\s*['\"]?)([\w\-]{8,})(['\"]?)"),
    re.compile(r"(?i)(token\s*[:=]\s*['\"]?)([\w\-]{8,})(['\"]?)"),
    re.compile(r"(?i)(password\s*[:=]\s*['\"]?)([^\s'\"]+)(['\"]?)"),
    re.compile(r"(?i)(secret\s*[:=]\s*['\"]?)([^\s'\"]+)(['\"]?)"),
    re.compile(r"sk-[a-zA-Z0-9_\-]{20,}"),
    re.compile(r"postgres(?:ql)?://[^\s:]+:([^\s@]+)@[^\s/]+"),
]

def redact(text: str) -> str:
    """Masks sensitive credentials, keys, and tokens found in the input text."""
    if not text or not isinstance(text, str):
        return text

    redacted = text
    for pattern in SECRET_PATTERNS:
        if pattern.groups == 3:
            redacted = pattern.sub(r"\1[REDACTED]\3", redacted)
        elif pattern.groups == 1:
            redacted = pattern.sub(lambda m: m.group(0).replace(m.group(1), "[REDACTED]"), redacted)
        else:
            redacted = pattern.sub("[REDACTED]", redacted)

    return redacted

# Alias for backwards compatibility with tests
redact_secrets = redact