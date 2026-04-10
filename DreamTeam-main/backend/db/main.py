import sqlite3

def create_database(db_path="dream_team_new.db"):  
    """
    Создаёт базу данных SQLite с таблицами и связями согласно обновлённой схеме.
    Изменения:
    - id_role перенесено из players в game_session.
    - Таблицы question и answers изменены: question хранит только текст,
      answers содержит id_session и id_question (связь многие-к-одному).
    """
    # SQL для создания таблиц (порядок важен из-за внешних ключей)
    sql_statements = [
        # Справочники без внешних ключей
        """
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS all_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cat_card INTEGER NOT NULL,
            text TEXT NOT NULL
        );
        """,
        # Новая таблица question (только текст)
        """
        CREATE TABLE IF NOT EXISTS question (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL
        );
        """,
        # Таблица players без id_role
        """
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT NOT NULL
        );
        """,
        # Таблица game_session с добавленным id_role
        """
        CREATE TABLE IF NOT EXISTS game_session (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_player INTEGER NOT NULL,
            id_project INTEGER NOT NULL,
            id_role INTEGER NOT NULL,
            room_code TEXT NOT NULL,
            FOREIGN KEY (id_player) REFERENCES players(id),
            FOREIGN KEY (id_project) REFERENCES projects(id),
            FOREIGN KEY (id_role) REFERENCES roles(id)
        );
        """,
        # Таблица answers с id_session и id_question
        """
        CREATE TABLE IF NOT EXISTS answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_session INTEGER NOT NULL,
            id_question INTEGER NOT NULL,
            text TEXT NOT NULL,
            FOREIGN KEY (id_session) REFERENCES game_session(id),
            FOREIGN KEY (id_question) REFERENCES question(id)
        );
        """,
        # Таблица player_cards (без изменений)
        """
        CREATE TABLE IF NOT EXISTS player_cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_session INTEGER NOT NULL,
            id_player INTEGER NOT NULL,
            id_card INTEGER NOT NULL,
            FOREIGN KEY (id_session) REFERENCES game_session(id),
            FOREIGN KEY (id_player) REFERENCES players(id),
            FOREIGN KEY (id_card) REFERENCES all_cards(id)
        );
        """
    ]

    # Подключаемся к базе (файл создастся автоматически)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")  # включаем поддержку внешних ключей
    cursor = conn.cursor()

    try:
        for statement in sql_statements:
            cursor.execute(statement)
        conn.commit()
        print(f"База данных '{db_path}' успешно создана с обновлённой схемой.")
    except sqlite3.Error as e:
        print(f"Ошибка при создании базы данных: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    create_database()