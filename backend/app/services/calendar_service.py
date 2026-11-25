import os
import json
import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any

from app.core import config
from app.services.reminder_manager import ReminderManager
from app.services.character_manager import CharacterManager

SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'
]


class CalendarConnectionError(RuntimeError):
    """Raised when Google Calendar cannot be read with the configured account."""


class CalendarService:
    @classmethod
    def find_credentials_file(cls) -> Optional[Path]:
        """Auto-detect any Google credentials JSON file in data/ or root directory."""
        candidates = [
            config.DATA_DIR / "google_credentials.json",
            config.DATA_DIR / "credentials.json",
            config.ROOT_DIR / "google_credentials.json",
            config.ROOT_DIR / "credentials.json"
        ]
        for c in candidates:
            if c.exists():
                return c

        # Scan for any service account or client secret JSON files in data/
        for p in config.DATA_DIR.glob("*.json"):
            if "pixelle" in p.name.lower() or "google" in p.name.lower() or "cred" in p.name.lower():
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if "type" in data or "installed" in data or "web" in data:
                        return p
                except Exception:
                    continue
        return None

    @classmethod
    def get_credentials_type(cls) -> Optional[str]:
        path = cls.find_credentials_file()
        if not path:
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("type", "oauth")
        except Exception:
            return None

    @classmethod
    def is_configured(cls) -> bool:
        return cls.find_credentials_file() is not None

    @classmethod
    def is_connected(cls) -> bool:
        try:
            cls.get_upcoming_events(max_results=1)
            return True
        except CalendarConnectionError:
            return False

    @classmethod
    def get_service_account_info(cls) -> Dict[str, Any]:
        path = cls.find_credentials_file()
        if not path or cls.get_credentials_type() != "service_account":
            return {}
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {
                "client_email": data.get("client_email"),
                "project_id": data.get("project_id"),
                "private_key_id": data.get("private_key_id"),
                "filename": path.name
            }
        except Exception:
            return {}

    @classmethod
    def get_auth_url(cls, redirect_uri: str = "http://localhost:8000/api/calendar/callback") -> Optional[str]:
        path = cls.find_credentials_file()
        if not path or cls.get_credentials_type() == "service_account":
            return None
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_secrets_file(
            str(path),
            scopes=SCOPES,
            redirect_uri=redirect_uri
        )
        auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')
        return auth_url

    @classmethod
    def exchange_code(cls, code: str, redirect_uri: str = "http://localhost:8000/api/calendar/callback") -> bool:
        path = cls.find_credentials_file()
        if not path or cls.get_credentials_type() == "service_account":
            return False
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_secrets_file(
            str(path),
            scopes=SCOPES,
            redirect_uri=redirect_uri
        )
        flow.fetch_token(code=code)
        creds = flow.credentials
        token_file = config.DATA_DIR / "google_token.json"
        with open(token_file, 'w') as token:
            token.write(creds.to_json())
        return True

    @classmethod
    def get_calendar_id(cls) -> str:
        """User's calendar ID or primary."""
        setting_file = config.DATA_DIR / "calendar_id.txt"
        if setting_file.exists():
            cid = setting_file.read_text(encoding="utf-8").strip()
            if cid:
                return cid
        return "primary"

    @classmethod
    def set_calendar_id(cls, calendar_id: str):
        setting_file = config.DATA_DIR / "calendar_id.txt"
        setting_file.write_text(calendar_id.strip(), encoding="utf-8")

    @classmethod
    def get_upcoming_events(cls, max_results: int = 15) -> List[Dict[str, Any]]:
        path = cls.find_credentials_file()
        token_file = config.DATA_DIR / "google_token.json"
        credential_type = cls.get_credentials_type() if path else None
        attempts = []
        if path and credential_type == "service_account":
            attempts.append((path, "service_account"))
        if token_file.exists():
            attempts.append((token_file, "oauth"))

        if not attempts:
            if not path:
                raise CalendarConnectionError("Google Calendar credentials are not configured.")
            raise CalendarConnectionError("Google Calendar is not authorized. Connect a Google account first.")

        last_error = None
        for credential_path, auth_type in attempts:
            try:
                items = cls._fetch_google_events(credential_path, auth_type, max_results)
                now = datetime.datetime.now(datetime.timezone.utc)
                events = []
                for item in items:
                    if item.get("status") == "cancelled":
                        continue

                    start = item["start"].get("dateTime", item["start"].get("date"))
                    end_data = item.get("end", {})
                    end = end_data.get("dateTime", end_data.get("date", start))
                    event_end = datetime.datetime.fromisoformat(end.replace("Z", "+00:00"))
                    if event_end.astimezone(datetime.timezone.utc) <= now:
                        continue

                    events.append({
                        "id": item["id"],
                        "title": item.get("summary", "Untitled Event"),
                        "start": start,
                        "end": end,
                        "description": item.get("description", ""),
                        "location": item.get("location", ""),
                        "is_live": True
                    })
                return events
            except Exception as exc:
                last_error = exc
                print(f"[Calendar] Google Calendar read failed ({type(exc).__name__}).")

        raise CalendarConnectionError(
            "Could not read the selected Google Calendar. Check authorization and calendar access."
        ) from last_error

    @classmethod
    def _fetch_google_events(cls, credential_path: Path, auth_type: str, max_results: int) -> List[Dict[str, Any]]:
        from googleapiclient.discovery import build

        if auth_type == "service_account":
            from google.oauth2 import service_account

            creds = service_account.Credentials.from_service_account_file(
                str(credential_path), scopes=SCOPES
            )
        else:
            from google.oauth2.credentials import Credentials

            creds = Credentials.from_authorized_user_file(str(credential_path), SCOPES)

        service = build("calendar", "v3", credentials=creds)
        time_min = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result = service.events().list(
            calendarId=cls.get_calendar_id(),
            timeMin=time_min,
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime"
        ).execute()
        return result.get("items", [])

    @classmethod
    def sync_to_reminders(cls, character_id: Optional[str] = None) -> List[Dict]:
        if not character_id:
            all_chars = CharacterManager.get_all_characters()
            active_char = next((c for c in all_chars if c.is_active), all_chars[0] if all_chars else None)
            if not active_char:
                return []
            character_id = active_char.id

        now = datetime.datetime.now(datetime.timezone.utc)
        events = [
            event for event in cls.get_upcoming_events(max_results=5)
            if datetime.datetime.fromisoformat(event["start"].replace("Z", "+00:00"))
            .astimezone(datetime.timezone.utc) > now
        ]
        created_reminders = []

        for ev in events:
            title = ev['title']
            msg = f"Upcoming: '{title}' starting soon!"
            scheduled = ev['start']

            try:
                rem = ReminderManager.create_reminder(
                    character_id=character_id,
                    title=f"Calendar: {title}",
                    message=msg,
                    scheduled_at=scheduled
                )
                created_reminders.append(rem.model_dump())
            except Exception as e:
                print(f"[Calendar] Failed to register reminder: {e}")

        return created_reminders
