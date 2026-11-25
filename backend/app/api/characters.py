from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.schemas.character import (
    CharacterGenerateRequest,
    CharacterResponse,
    CharacterUpdateRequest
)
from app.services.character_manager import CharacterManager
from app.services.generation import TesseraGenerator

router = APIRouter(prefix="/characters", tags=["Characters"])


@router.post("/generate", response_model=CharacterResponse)
def generate_character(req: CharacterGenerateRequest):
    """Generate a pixel-art character using Tessera and save it."""
    try:
        generator = TesseraGenerator.get_instance()
        generated_image = generator.generate(
            prompt=req.prompt,
            steps=req.steps,
            cfg_scale=req.cfg_scale,
            seed=req.seed
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model generation failed: {str(e)}")

    character = CharacterManager.create_character(
        prompt=req.prompt,
        name=req.name,
        image=generated_image
    )
    return character


@router.get("", response_model=List[CharacterResponse])
def get_all_characters():
    """Retrieve all saved characters."""
    return CharacterManager.get_all_characters()


@router.get("/{char_id}", response_model=CharacterResponse)
def get_character(char_id: str):
    """Retrieve a single character by ID."""
    char = CharacterManager.get_character(char_id)
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    return char


@router.patch("/{char_id}", response_model=CharacterResponse)
def update_character(char_id: str, req: CharacterUpdateRequest):
    """Update character name, banner settings, or active status."""
    char = CharacterManager.update_character(
        char_id=char_id,
        name=req.name,
        banner=req.banner,
        is_active=req.is_active
    )
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    return char


@router.delete("/{char_id}")
def delete_character(char_id: str):
    """Delete a character and its assets."""
    success = CharacterManager.delete_character(char_id)
    if not success:
        raise HTTPException(status_code=404, detail="Character not found")
    return {"status": "success", "message": f"Character {char_id} deleted"}


@router.get("/{char_id}/image")
def get_character_image(
    char_id: str,
    variant: str = Query("scaled", description="Image variant: 'raw' (16x16), 'scaled' (256x256), or 'thumb' (64x64)")
):
    """Serve the character sprite image file directly."""
    img_path = CharacterManager.get_image_path(char_id, variant=variant)
    if not img_path:
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path=str(img_path), media_type="image/png")
