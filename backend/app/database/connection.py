import sqlite3
from contextlib import contextmanager
from typing import Generator
from app.core import config


def get_db_connection() -> sqlite3.Connection:
    """Create a SQLite database connection with row factory and foreign keys enabled."""
    conn = sqlite3.connect(str(config.DATABASE_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Context manager for database operations."""
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initialize database tables according to Pixelle specifications."""
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS characters (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            prompt TEXT NOT NULL,
            sprite_raw_path TEXT NOT NULL,
            sprite_scaled_path TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS character_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id TEXT NOT NULL UNIQUE,
            banner_enabled BOOLEAN DEFAULT 0,
            banner_text TEXT DEFAULT '',
            banner_style TEXT DEFAULT 'bubble',
            banner_color TEXT DEFAULT '#FFFFFF',
            is_active BOOLEAN DEFAULT 0,
            FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            character_id TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            scheduled_at TIMESTAMP NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE CASCADE
        );
        """)
