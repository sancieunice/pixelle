from typing import Optional
from pydantic import BaseModel, Field


class ReminderCreateRequest(BaseModel):
    character_id: str
    title: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=1, max_length=255)
    scheduled_at: str = Field(..., description="ISO 8601 timestamp string e.g. 2026-11-24T20:00:00")


class ReminderUpdateRequest(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    scheduled_at: Optional[str] = None
    status: Optional[str] = None  # pending, delivered, dismissed


class ReminderResponse(BaseModel):
    id: str
    character_id: str
    title: str
    message: str
    scheduled_at: str
    status: str
    created_at: str
