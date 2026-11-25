from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import torch

from app.api.characters import router as characters_router
from app.api.reminders import router as reminders_router
from app.api.calendar import router as calendar_router
from app.database.connection import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database tables
    init_db()
    print("[Pixelle] Database initialized.")
    yield
    print("[Pixelle] Shutting down.")


# Ensure DB tables exist on module load
init_db()

app = FastAPI(
    title="Pixelle Companion API",
    description="Backend API for Pixelle AI-powered pixel art companion",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for web frontend (Vite default is 5173) and Electron
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(characters_router, prefix="/api")
app.include_router(reminders_router, prefix="/api")
app.include_router(calendar_router, prefix="/api")


@app.get("/api/health")
def health_check():
    has_cuda = torch.cuda.is_available()
    device_name = torch.cuda.get_device_name(0) if has_cuda else "CPU"
    return {
        "status": "ok",
        "app": "Pixelle API",
        "version": "1.0.0",
        "cuda_available": has_cuda,
        "device": device_name
    }


if __name__ == "__main__":
    import uvicorn
    from app.core import config
    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, reload=True)
