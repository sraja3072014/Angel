from pathlib import Path
import sqlite3

def migrate(db_path):
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        connection.execute('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
        connection.commit()

if __name__ == '__main__':
    migrate('data/app.db')
