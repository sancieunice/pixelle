"""
Automated test suite for Pixelle FastAPI backend endpoints.
"""

import sys
from pathlib import Path

# Add backend directory to path
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import init_db

# Initialize database
init_db()
client = TestClient(app)


def test_api_pipeline():
    print("=" * 60)
    print("PIXELLE — Automated API Endpoint Tests")
    print("=" * 60)

    # 1. Health check
    print("\n[Test 1] Health Check: GET /api/health")
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    health_data = res.json()
    print(f"  Result: {health_data}")
    assert health_data["status"] == "ok"

    # 2. Character Generation
    print("\n[Test 2] Character Generation: POST /api/characters/generate")
    prompt = "cute duck wearing hat"
    name = "Sir Quacks"
    res = client.post("/api/characters/generate", json={"prompt": prompt, "name": name, "steps": 8, "cfg_scale": 3.0})
    assert res.status_code == 200, f"Character generation failed: {res.text}"
    char_data = res.json()
    char_id = char_data["id"]
    print(f"  Created Character ID: {char_id}")
    print(f"  Name: {char_data['name']}")
    print(f"  Sprite Scaled URL: {char_data['sprite_scaled_url']}")
    assert char_data["name"] == name
    assert char_data["prompt"] == prompt

    # 3. Retrieve Character by ID
    print(f"\n[Test 3] Get Character: GET /api/characters/{char_id}")
    res = client.get(f"/api/characters/{char_id}")
    assert res.status_code == 200
    assert res.json()["id"] == char_id

    # 4. List All Characters
    print("\n[Test 4] List Characters: GET /api/characters")
    res = client.get("/api/characters")
    assert res.status_code == 200
    chars = res.json()
    print(f"  Total characters in DB: {len(chars)}")
    assert any(c["id"] == char_id for c in chars)

    # 5. Fetch Character Image
    print(f"\n[Test 5] Fetch Image: GET /api/characters/{char_id}/image?variant=scaled")
    res = client.get(f"/api/characters/{char_id}/image?variant=scaled")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert len(res.content) > 0
    print(f"  Image binary verified ({len(res.content)} bytes)")

    # 6. Update Character (Banner & Active)
    print(f"\n[Test 6] Update Character: PATCH /api/characters/{char_id}")
    update_payload = {
        "name": "Sir Quacks The First",
        "is_active": True,
        "banner": {
            "enabled": True,
            "text": "Quack quack! Time to code!",
            "style": "bubble",
            "color": "#FFF8DC"
        }
    }
    res = client.patch(f"/api/characters/{char_id}", json=update_payload)
    assert res.status_code == 200
    updated = res.json()
    assert updated["name"] == "Sir Quacks The First"
    assert updated["is_active"] is True
    assert updated["banner"]["enabled"] is True
    assert updated["banner"]["text"] == "Quack quack! Time to code!"
    print(f"  Updated Name: {updated['name']}")
    print(f"  Updated Banner Text: {updated['banner']['text']}")

    # 7. Create Reminder
    print("\n[Test 7] Create Reminder: POST /api/reminders")
    rem_payload = {
        "character_id": char_id,
        "title": "Stretch Break",
        "message": "Stand up and stretch for 2 minutes!",
        "scheduled_at": "2026-11-23T23:00:00"
    }
    res = client.post("/api/reminders", json=rem_payload)
    assert res.status_code == 200
    rem_data = res.json()
    rem_id = rem_data["id"]
    print(f"  Created Reminder ID: {rem_id} | Title: {rem_data['title']}")

    # 8. List Reminders
    print("\n[Test 8] List Reminders: GET /api/reminders")
    res = client.get("/api/reminders")
    assert res.status_code == 200
    reminders = res.json()
    assert any(r["id"] == rem_id for r in reminders)
    print(f"  Total reminders: {len(reminders)}")

    # 9. Update Reminder Status
    print(f"\n[Test 9] Update Reminder Status: PATCH /api/reminders/{rem_id}")
    res = client.patch(f"/api/reminders/{rem_id}", json={"status": "delivered"})
    assert res.status_code == 200
    assert res.json()["status"] == "delivered"
    print(f"  Reminder status updated to 'delivered'")

    # 10. Delete Reminder & Character
    print(f"\n[Test 10] Cleanup: DELETE /api/reminders/{rem_id} & /api/characters/{char_id}")
    res = client.delete(f"/api/reminders/{rem_id}")
    assert res.status_code == 200
    res = client.delete(f"/api/characters/{char_id}")
    assert res.status_code == 200

    # Verify character is gone
    res = client.get(f"/api/characters/{char_id}")
    assert res.status_code == 404
    print("  Character and reminders successfully deleted.")

    print("\n" + "=" * 60)
    print("ALL API ENDPOINT TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    test_api_pipeline()
