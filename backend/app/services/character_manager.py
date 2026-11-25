import shutil
import uuid
from pathlib import Path
from typing import Dict, List, Optional
from PIL import Image

from app.core import config
from app.database.connection import get_db
from app.services.image_processor import ImageProcessor
from app.schemas.character import BannerSettings, CharacterResponse


class CharacterManager:
    @staticmethod
    def _row_to_dict(char_row, settings_row=None) -> Dict:
        char_id = char_row["id"]
        banner = BannerSettings(
            enabled=bool(settings_row["banner_enabled"]) if settings_row else False,
            text=settings_row["banner_text"] if settings_row else "",
            style=settings_row["banner_style"] if settings_row else "bubble",
            color=settings_row["banner_color"] if settings_row else "#FFFFFF",
        )
        is_active = bool(settings_row["is_active"]) if settings_row else False

        return {
            "id": char_id,
            "name": char_row["name"],
            "prompt": char_row["prompt"],
            "sprite_raw_url": f"/api/characters/{char_id}/image?variant=raw",
            "sprite_scaled_url": f"/api/characters/{char_id}/image?variant=scaled",
            "banner": banner,
            "is_active": is_active,
            "created_at": str(char_row["created_at"])
        }

    @classmethod
    def create_character(
        cls,
        prompt: str,
        name: Optional[str],
        image: Image.Image
    ) -> CharacterResponse:
        char_id = f"char_{uuid.uuid4().hex[:8]}"
        final_name = name.strip() if name and name.strip() else f"Pixelle {char_id[-4:].upper()}"
        char_dir = config.CHARACTERS_DIR / char_id

        raw_path, scaled_path, _ = ImageProcessor.save_sprite_assets(image, char_dir)

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO characters (id, name, prompt, sprite_raw_path, sprite_scaled_path)
                VALUES (?, ?, ?, ?, ?)
                """,
                (char_id, final_name, prompt, str(raw_path), str(scaled_path))
            )
            conn.execute(
                """
                INSERT INTO character_settings (character_id, banner_enabled, banner_text, banner_style, banner_color, is_active)
                VALUES (?, 0, '', 'bubble', '#FFFFFF', 0)
                """,
                (char_id,)
            )

        return cls.get_character(char_id)

    @classmethod
    def get_character(cls, char_id: str) -> Optional[CharacterResponse]:
        with get_db() as conn:
            char_row = conn.execute("SELECT * FROM characters WHERE id = ?", (char_id,)).fetchone()
            if not char_row:
                return None
            settings_row = conn.execute("SELECT * FROM character_settings WHERE character_id = ?", (char_id,)).fetchone()
            data = cls._row_to_dict(char_row, settings_row)
            return CharacterResponse(**data)

    @classmethod
    def get_all_characters(cls) -> List[CharacterResponse]:
        with get_db() as conn:
            rows = conn.execute("SELECT * FROM characters ORDER BY created_at DESC").fetchall()
            results = []
            for r in rows:
                settings = conn.execute("SELECT * FROM character_settings WHERE character_id = ?", (r["id"],)).fetchone()
                results.append(CharacterResponse(**cls._row_to_dict(r, settings)))
            return results

    @classmethod
    def update_character(
        cls,
        char_id: str,
        name: Optional[str] = None,
        banner: Optional[BannerSettings] = None,
        is_active: Optional[bool] = None
    ) -> Optional[CharacterResponse]:
        with get_db() as conn:
            char_row = conn.execute("SELECT * FROM characters WHERE id = ?", (char_id,)).fetchone()
            if not char_row:
                return None

            if name is not None:
                conn.execute("UPDATE characters SET name = ? WHERE id = ?", (name.strip(), char_id))

            if banner is not None:
                conn.execute(
                    """
                    UPDATE character_settings
                    SET banner_enabled = ?, banner_text = ?, banner_style = ?, banner_color = ?
                    WHERE character_id = ?
                    """,
                    (int(banner.enabled), banner.text, banner.style, banner.color, char_id)
                )

            if is_active is not None:
                if is_active:
                    # Only one character active at a time
                    conn.execute("UPDATE character_settings SET is_active = 0")
                conn.execute("UPDATE character_settings SET is_active = ? WHERE character_id = ?", (int(is_active), char_id))

        return cls.get_character(char_id)

    @classmethod
    def delete_character(cls, char_id: str) -> bool:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM characters WHERE id = ?", (char_id,)).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM characters WHERE id = ?", (char_id,))

        # Remove files
        char_dir = config.CHARACTERS_DIR / char_id
        if char_dir.exists():
            shutil.rmtree(char_dir, ignore_errors=True)

        return True

    @classmethod
    def get_image_path(cls, char_id: str, variant: str = "scaled") -> Optional[Path]:
        char_dir = config.CHARACTERS_DIR / char_id
        if not char_dir.exists():
            return None

        filename = "raw.png" if variant == "raw" else ("thumbnail.png" if variant == "thumb" else "scaled.png")
        path = char_dir / filename
        return path if path.exists() else None
