import datetime
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.core import config
from app.services.calendar_service import CalendarConnectionError, CalendarService


class CalendarServiceTests(unittest.TestCase):
    def test_missing_credentials_do_not_return_demo_events(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(config, "DATA_DIR", Path(temp_dir)):
                with patch.object(CalendarService, "find_credentials_file", return_value=None):
                    with self.assertRaises(CalendarConnectionError):
                        CalendarService.get_upcoming_events()

    def test_only_future_live_events_are_returned(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        google_events = [
            {
                "id": "future",
                "summary": "Real event",
                "start": {"dateTime": (now + datetime.timedelta(hours=1)).isoformat()},
                "end": {"dateTime": (now + datetime.timedelta(hours=2)).isoformat()},
            },
            {
                "id": "past",
                "summary": "Past event",
                "start": {"dateTime": (now - datetime.timedelta(minutes=1)).isoformat()},
                "end": {"dateTime": now.isoformat()},
            },
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.object(config, "DATA_DIR", Path(temp_dir)):
                with patch.object(CalendarService, "find_credentials_file", return_value=Path(temp_dir) / "credentials.json"):
                    with patch.object(CalendarService, "get_credentials_type", return_value="service_account"):
                        with patch.object(CalendarService, "_fetch_google_events", return_value=google_events):
                            events = CalendarService.get_upcoming_events()

        self.assertEqual([event["id"] for event in events], ["future"])
        self.assertTrue(events[0]["is_live"])


if __name__ == "__main__":
    unittest.main()
