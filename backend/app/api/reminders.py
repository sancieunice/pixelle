from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from app.schemas.reminder import (
    ReminderCreateRequest,
    ReminderResponse,
    ReminderUpdateRequest
)
from app.services.reminder_manager import ReminderManager
from app.services.character_manager import CharacterManager

router = APIRouter(prefix="/reminders", tags=["Reminders"])


@router.post("", response_model=ReminderResponse)
def create_reminder(req: ReminderCreateRequest):
    """Create a new scheduled reminder associated with a character."""
    # Ensure character exists
    char = CharacterManager.get_character(req.character_id)
    if not char:
        raise HTTPException(status_code=404, detail=f"Character {req.character_id} not found")

    return ReminderManager.create_reminder(
        character_id=req.character_id,
        title=req.title,
        message=req.message,
        scheduled_at=req.scheduled_at
    )


@router.get("", response_model=List[ReminderResponse])
def get_reminders(character_id: Optional[str] = Query(None)):
    """Retrieve scheduled reminders, optionally filtered by character."""
    return ReminderManager.get_reminders(character_id=character_id)


@router.patch("/{rem_id}", response_model=ReminderResponse)
def update_reminder(rem_id: str, req: ReminderUpdateRequest):
    """Update reminder status or content."""
    reminder = ReminderManager.update_reminder(
        rem_id=rem_id,
        title=req.title,
        message=req.message,
        scheduled_at=req.scheduled_at,
        status=req.status
    )
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return reminder


@router.delete("/{rem_id}")
def delete_reminder(rem_id: str):
    """Delete a reminder."""
    success = ReminderManager.delete_reminder(rem_id)
    if not success:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"status": "success", "message": f"Reminder {rem_id} deleted"}
