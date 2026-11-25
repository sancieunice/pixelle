import uuid
from typing import List, Optional
from app.database.connection import get_db
from app.schemas.reminder import ReminderResponse


class ReminderManager:
    @staticmethod
    def _row_to_dict(row) -> dict:
        return {
            "id": row["id"],
            "character_id": row["character_id"],
            "title": row["title"],
            "message": row["message"],
            "scheduled_at": str(row["scheduled_at"]),
            "status": row["status"],
            "created_at": str(row["created_at"])
        }

    @classmethod
    def create_reminder(
        cls,
        character_id: str,
        title: str,
        message: str,
        scheduled_at: str
    ) -> ReminderResponse:
        rem_id = f"rem_{uuid.uuid4().hex[:8]}"
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO reminders (id, character_id, title, message, scheduled_at, status)
                VALUES (?, ?, ?, ?, ?, 'pending')
                """,
                (rem_id, character_id, title, message, scheduled_at)
            )
        return cls.get_reminder(rem_id)

    @classmethod
    def get_reminder(cls, rem_id: str) -> Optional[ReminderResponse]:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM reminders WHERE id = ?", (rem_id,)).fetchone()
            if not row:
                return None
            return ReminderResponse(**cls._row_to_dict(row))

    @classmethod
    def get_reminders(cls, character_id: Optional[str] = None) -> List[ReminderResponse]:
        with get_db() as conn:
            if character_id:
                rows = conn.execute("SELECT * FROM reminders WHERE character_id = ? ORDER BY scheduled_at ASC", (character_id,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM reminders ORDER BY scheduled_at ASC").fetchall()
            return [ReminderResponse(**cls._row_to_dict(r)) for r in rows]

    @classmethod
    def update_reminder(
        cls,
        rem_id: str,
        title: Optional[str] = None,
        message: Optional[str] = None,
        scheduled_at: Optional[str] = None,
        status: Optional[str] = None
    ) -> Optional[ReminderResponse]:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM reminders WHERE id = ?", (rem_id,)).fetchone()
            if not row:
                return None

            updates = []
            params = []
            if title is not None:
                updates.append("title = ?")
                params.append(title)
            if message is not None:
                updates.append("message = ?")
                params.append(message)
            if scheduled_at is not None:
                updates.append("scheduled_at = ?")
                params.append(scheduled_at)
            if status is not None:
                updates.append("status = ?")
                params.append(status)

            if updates:
                params.append(rem_id)
                query = f"UPDATE reminders SET {', '.join(updates)} WHERE id = ?"
                conn.execute(query, tuple(params))

        return cls.get_reminder(rem_id)

    @classmethod
    def delete_reminder(cls, rem_id: str) -> bool:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM reminders WHERE id = ?", (rem_id,)).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM reminders WHERE id = ?", (rem_id,))
            return True
