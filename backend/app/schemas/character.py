from typing import Optional
from pydantic import BaseModel, Field


class BannerSettings(BaseModel):
    enabled: bool = False
    text: str = ""
    style: str = Field(default="bubble", description="bubble, sign, or scroll")
    color: str = "#FFFFFF"


class CharacterGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=240, description="Natural-language character description")
    name: Optional[str] = Field(default=None, max_length=50, description="Optional name for the companion")
    steps: int = Field(default=16, ge=2, le=32, description="Diffusion steps")
    cfg_scale: float = Field(default=3.0, ge=1.0, le=10.0, description="Classifier-free guidance scale")
    seed: Optional[int] = Field(default=None, description="Optional seed for reproducible generation")


class CharacterUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=50)
    banner: Optional[BannerSettings] = None
    is_active: Optional[bool] = None


class CharacterResponse(BaseModel):
    id: str
    name: str
    prompt: str
    sprite_raw_url: str
    sprite_scaled_url: str
    banner: BannerSettings
    is_active: bool
    created_at: str
