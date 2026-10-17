import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import Base, engine
from models import DawProject, DawTrack, Song
from routers.daw import UPLOAD_DIR, router as daw_router
from routers.songs import router as songs_router

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with actual origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create directory for audio uploads if it doesn't exist
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mount the upload directory to serve static audio files
app.mount("/audio", StaticFiles(directory=UPLOAD_DIR), name="audio")

app.include_router(songs_router)
app.include_router(daw_router)


@app.get("/api/hello")
def read_hello():
    return {"message": "Hello from FastAPI backend"}
