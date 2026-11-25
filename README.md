# PIXELLE — AI-Powered Pixel-Art Desktop Companion

> **"Your little world. Your own companion."**

Pixelle is an AI-powered desktop companion application. Users create personalized pixel-art characters using natural language prompts, customize their banners and dialogue, and interact with them as a transparent desktop overlay on Windows with productivity quotes and Google Calendar reminders.

---

## Architecture Overview

```
pixelle/
├── backend/                      # Python + FastAPI REST API
│   ├── app/
│   │   ├── api/                  # Endpoints: characters, calendar, reminders
│   │   ├── core/                 # Config & paths
│   │   ├── database/             # SQLite connection & schema tables
│   │   ├── schemas/              # Pydantic data models
│   │   └── services/             # Tessera model generator, image processor
│   │   └── main.py
│   ├── requirements.txt
│   └── test_api.py               # API test suite
│
├── frontend/                     # React + Vite + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── components/           # PromptInput, CharacterPreview, BannerEditor,
│   │   │                         # CompanionSimulator, CharacterCard, CalendarView
│   │   ├── services/             # API client
│   │   └── types/                # TypeScript interfaces
│   └── dist/                     # Production build
│
├── desktop/                      # Electron Windows Companion
│   ├── src/
│   │   ├── main/main.js          # Fixed-bounds window management & System Tray
│   │   ├── preload/preload.js    # Safe IPC bridge
│   │   └── renderer/             # Companion canvas, animations & sound
│   └── package.json
│
├── tessera-pixel-studio/         # Discrete masked-diffusion pixel art model
├── data/                         # Local storage (SQLite db & PNG sprites)
└── start_pixelle.bat             # One-click startup for all components
```

---

## Key Features

1. **AI Character Generation**:
   * Powered by the **Tessera** 47.6M-parameter discrete masked-diffusion model.
   * Generates $16\times16$ sprites with learned 512-color palettes (token 0 = transparent background).
   * GPU-accelerated: generates crisp sprites in under a second.

2. **Pixel-Art Sharp Upscaling**:
   * Nearest-neighbor integer interpolation preserves crisp pixel edges ($16\times16 \rightarrow 256\times256$).
   * Saves both raw and HD sprites.

3. **Desktop Companion Mechanics**:
   * **Grab & Place**: Pick up your companion and drop it anywhere on your screen.
   * **Undisturbed Routine**: When placed or left alone, it takes two small steps, cutely shakes, and sleeps with floating Zzz particles.
   * **Productivity Quotes**: Single-click to pop a curated motivation quote (auto-closes in 5 seconds).
   * **Calendar Reminders**: Double-click to check your next Google Calendar event (auto-closes in 5 seconds).
   * **System Tray Controls**: Quick shortcuts to center the companion or reset it to the bottom-right floor.

---

## Quick Start

Double-click **`start_pixelle.bat`** to start all three components:
1. **Backend API**: `http://localhost:8000`
2. **Web Studio**: `http://localhost:5173`
3. **Desktop Companion**: Transparent overlay on your screen
