from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
ROOT_DIR = BACKEND_DIR.parent
DATA_DIR = ROOT_DIR / "data"
DATABASE_DIR = DATA_DIR / "database"
CHARACTERS_DIR = DATA_DIR / "characters"
TESSERA_DIR = ROOT_DIR / "tessera-pixel-studio"

# Ensure directories exist
DATABASE_DIR.mkdir(parents=True, exist_ok=True)
CHARACTERS_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_PATH = DATABASE_DIR / "pixelle.db"
DEFAULT_MODEL_REPO = "thejagstudio/tessera-small"
MODEL_FILENAME = "tessera-small-fp16.pt"
HOST = "0.0.0.0"
PORT = 8000
