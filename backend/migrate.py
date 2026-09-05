from backend.app.db import ensure_schema
from backend.app.migrations import apply_migrations


def main() -> None:
    ensure_schema()
    applied = apply_migrations()
    print(f"Database ready; applied migrations: {applied or 'none'}")


if __name__ == "__main__":
    main()
