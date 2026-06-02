from passlib.context import CryptContext
import sys

try:
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    h = pwd_context.hash("testpassword")
    v = pwd_context.verify("testpassword", h)
    print(f"Bcrypt test: {'Success' if v else 'Failed'}")
except Exception as e:
    print(f"Bcrypt test error: {e}")
    sys.exit(1)
