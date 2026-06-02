"""
Developer utility — verify bcrypt library works in this environment.
NOT a pytest test. Run directly: python scripts/check_bcrypt.py
"""
import sys
from passlib.context import CryptContext

try:
    ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    h   = ctx.hash("testpassword")
    ok  = ctx.verify("testpassword", h)
    print(f"[{'OK' if ok else 'FAIL'}] bcrypt round-trip")
    sys.exit(0 if ok else 1)
except Exception as exc:
    print(f"[ERROR] {exc}")
    sys.exit(1)
