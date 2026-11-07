"""Conservative credential pattern gate; not a comprehensive privacy scanner."""
import re

PATTERNS = [
    r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    r'\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}',
    r'\bgh[pousr]_[A-Za-z0-9]{30,}',
    r'\bAKIA[0-9A-Z]{16}\b',
]


def check_text(text, source):
    if any(re.search(pattern, text) for pattern in PATTERNS):
        raise ValueError(f'Possible credential in {source}; redact it before sending or committing (value withheld)')
