import sqlite3
from pathlib import Path

def test_seed_fixture_exists():
    db = Path('data/app.db')
    assert db.exists()
    with sqlite3.connect(db) as connection:
        assert connection.execute('SELECT COUNT(*) FROM items').fetchone()[0] >= 1
