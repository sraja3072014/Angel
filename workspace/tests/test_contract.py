import sqlite3
from pathlib import Path

WORKSPACE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = WORKSPACE_DIR / "data" / "app.db"


def test_seed_fixture_exists():
    assert DB_PATH.exists(), f"Database missing at {DB_PATH}"
    with sqlite3.connect(DB_PATH) as connection:
        row = connection.execute(
            "SELECT name FROM items WHERE name = ?", ("fixture-item",)
        ).fetchone()
    assert row is not None, "Seeded item 'fixture-item' is missing"
