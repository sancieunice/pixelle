from pathlib import Path
from typing import Tuple
from PIL import Image, ImageDraw, ImageFont


class ImageProcessor:
    @staticmethod
    def save_sprite_assets(
        image: Image.Image,
        char_dir: Path,
        scale_size: int = 256,
        thumb_size: int = 64
    ) -> Tuple[Path, Path, Path]:
        """
        Saves raw 16x16 sprite, scaled 256x256 sprite, and 64x64 thumbnail
        using nearest-neighbor scaling to preserve sharp pixel art edges.
        """
        char_dir.mkdir(parents=True, exist_ok=True)

        raw_path = char_dir / "raw.png"
        scaled_path = char_dir / "scaled.png"
        thumb_path = char_dir / "thumbnail.png"

        # Ensure RGBA for transparent background
        img_rgba = image.convert("RGBA")

        # 1. Raw 16x16
        img_rgba.save(raw_path, format="PNG")

        # 2. Scaled nearest-neighbor
        scaled = img_rgba.resize((scale_size, scale_size), resample=Image.Resampling.NEAREST)
        scaled.save(scaled_path, format="PNG")

        # 3. Thumbnail
        thumb = img_rgba.resize((thumb_size, thumb_size), resample=Image.Resampling.NEAREST)
        thumb.save(thumb_path, format="PNG")

        return raw_path, scaled_path, thumb_path

    @staticmethod
    def composite_speech_bubble(
        sprite: Image.Image,
        text: str,
        style: str = "bubble",
        bg_color: str = "#FFFFFF"
    ) -> Image.Image:
        """
        Composites a pixel-art speech bubble or banner above the sprite.
        """
        sprite_rgba = sprite.convert("RGBA")
        width, height = sprite_rgba.size

        # Simple bubble box above character
        bubble_height = 60
        canvas_height = height + bubble_height + 10
        canvas = Image.new("RGBA", (width, canvas_height), (0, 0, 0, 0))

        # Paste character at the bottom
        canvas.paste(sprite_rgba, (0, bubble_height + 10), sprite_rgba)

        # Draw bubble
        draw = ImageDraw.Draw(canvas)
        # Background box with border
        draw.rounded_rectangle([(10, 5), (width - 10, bubble_height)], radius=6, fill=bg_color, outline="#000000", width=2)

        # Little tail pointing down to character
        tail_center = width // 2
        draw.polygon([(tail_center - 8, bubble_height), (tail_center + 8, bubble_height), (tail_center, bubble_height + 8)], fill=bg_color, outline="#000000")
        # Cover border seam between box and tail
        draw.line([(tail_center - 7, bubble_height), (tail_center + 7, bubble_height)], fill=bg_color, width=2)

        # Draw text (truncate if needed)
        display_text = text if len(text) <= 30 else text[:27] + "..."
        draw.text((20, 20), display_text, fill="#000000")

        return canvas
