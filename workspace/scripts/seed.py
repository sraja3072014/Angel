import sqlite3

def seed(db_path):
    with sqlite3.connect(db_path) as connection:
        connection.execute("INSERT INTO items(name) VALUES (?)", ("fixture-item",))
        connection.commit()

if __name__ == '__main__':
    seed('data/app.db')
