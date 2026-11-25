import random
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core import config
from app.services.calendar_service import CalendarConnectionError, CalendarService

router = APIRouter(prefix="/calendar", tags=["Calendar"])

# Configuration: How often quotes pop up on the desktop companion (in seconds)
# Default is 300 seconds (5 minutes), lasting for 10 seconds
QUOTE_INTERVAL_SECONDS = 300

HARD_WORK_QUOTES = [
    "Lock in. Your future self is watching.",
    "It's giving main character energy.",
    "One day or day one. You decide.",
    "No plot twist, just hard work.",
    "Slow progress is still a flex.",
    "Delulu is not the solulu. Discipline is.",
    "Stay lowkey. Let the results yap.",
    "You're not behind. You're on your own timeline.",
    "Be so good they can't scroll past.",
    "It's not luck. It's the hours nobody saw.",
    "Less scrolling, more building.",
    "POV: You finally stopped making excuses.",
    "Trust the process. Even when it's giving nothing.",
    "Currently in my locked-in era.",
    "The comeback is personal.",
    "Not every day is a slay. Show up anyway.",
    "Your only competition is yesterday's you.",
    "Hard launch your success, not your plans.",
    "Consistency? That's the real glow-up.",
    "Do it tired. Do it scared. Just do it.",
    "The goal is progress, not perfection.",
    "Keep going. This is your character development.",
    "Romanticise the grind, but don't forget to rest.",
    "Big dreams. Small steps. Unhinged dedication.",
    "Let them doubt. You have work to do.",
    "Quietly becoming everything I said I'd be.",
    "The vision is loading. Please don't disturb.",
    "Building my future like nobody's watching.",
    "Not lucky. Just locked in.",
    "One commit closer to the dream."
]


@router.get("/status")
def get_calendar_status():
    """Check Google Calendar configuration and connection status."""
    cred_path = CalendarService.find_credentials_file()
    cred_type = CalendarService.get_credentials_type()
    sa_info = CalendarService.get_service_account_info()
    is_connected = CalendarService.is_connected()
    has_oauth_token = (config.DATA_DIR / "google_token.json").exists()

    error_reason = None
    if not is_connected:
        if not cred_path and not has_oauth_token:
            error_reason = "Google Calendar credentials are not configured."
        elif cred_type != "service_account" and not has_oauth_token:
            error_reason = "Google Calendar is not authorized. Connect a Google account first."
        else:
            error_reason = "Could not read the selected calendar. Check authorization and calendar access."

    return {
        "is_configured": cred_path is not None or has_oauth_token,
        "is_connected": is_connected,
        "credentials_path": cred_path.name if cred_path else "None",
        "credentials_type": cred_type,
        "service_account_info": sa_info,
        "calendar_id": CalendarService.get_calendar_id(),
        "error_reason": error_reason
    }


@router.post("/calendar-id")
def update_calendar_id(calendar_id: str = Query(..., description="Your Google email or Calendar ID")):
    """Set the Calendar ID to read events from (e.g. your personal Gmail)."""
    CalendarService.set_calendar_id(calendar_id)
    return {"status": "success", "calendar_id": CalendarService.get_calendar_id()}



@router.get("/auth-url")
def get_auth_url(redirect_uri: str = "http://localhost:8000/api/calendar/callback"):
    """Get Google OAuth consent URL."""
    url = CalendarService.get_auth_url(redirect_uri)
    if not url:
        raise HTTPException(
            status_code=400,
            detail="Google credentials not configured. Please place credentials JSON in data/google_credentials.json."
        )
    return {"auth_url": url}


@router.get("/callback")
def oauth_callback(code: Optional[str] = None, error: Optional[str] = None):
    """Handle OAuth redirect callback."""
    if error:
        return HTMLResponse(f"<h3>Google OAuth Error: {error}</h3>")
    if not code:
        return HTMLResponse("<h3>Missing authorization code</h3>")

    success = CalendarService.exchange_code(code)
    if success:
        return HTMLResponse("""
        <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #0f172a; color: #f8fafc;">
            <h2>Google Calendar Connected Successfully!</h2>
            <p>Your companion can now read your upcoming events and schedule reminders.</p>
            <p>You can close this tab and return to Pixelle.</p>
        </body>
        </html>
        """)
    return HTMLResponse("<h3>Failed to exchange authorization code</h3>")


@router.get("/events")
def get_calendar_events(max_results: int = 10):
    """Retrieve upcoming events from the selected Google Calendar."""
    try:
        return CalendarService.get_upcoming_events(max_results=max_results)
    except CalendarConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/sync-reminders")
def sync_calendar_reminders(character_id: Optional[str] = None):
    """Sync upcoming calendar events into Pixelle reminders."""
    try:
        reminders = CalendarService.sync_to_reminders(character_id)
    except CalendarConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "status": "success",
        "synced_count": len(reminders),
        "reminders": reminders
    }


@router.get("/quotes")
def get_work_quotes():
    """Retrieve hard work and productivity quotes and interval."""
    return {
        "quotes": HARD_WORK_QUOTES,
        "interval_seconds": QUOTE_INTERVAL_SECONDS,
        "random": random.choice(HARD_WORK_QUOTES) if HARD_WORK_QUOTES else ""
    }


@router.post("/quotes/interval")
def set_quote_interval(interval_seconds: int = Query(..., ge=5, le=3600)):
    """Update quote rotation interval in seconds."""
    global QUOTE_INTERVAL_SECONDS
    QUOTE_INTERVAL_SECONDS = interval_seconds
    return {
        "status": "success",
        "interval_seconds": QUOTE_INTERVAL_SECONDS
    }
