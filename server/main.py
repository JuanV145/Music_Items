from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, SessionLocal, Base
from models import Song
from pydantic import BaseModel
from typing import List, Optional
import json

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

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic models for request/response
class SongBase(BaseModel):
    title: str
    artist: Optional[str] = None
    key_root: str
    key_mode: str = ""
    tempo: str
    time_signature: str
    structure: Optional[str] = None
    chords_lyrics: str

class SongCreate(SongBase):
    pass

class SongUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    key_root: Optional[str] = None
    key_mode: Optional[str] = None
    tempo: Optional[str] = None
    time_signature: Optional[str] = None
    structure: Optional[str] = None
    chords_lyrics: Optional[str] = None

class SongResponse(SongBase):
    id: int
    created_at: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

# API Endpoints
@app.post("/api/songs/", response_model=SongResponse)
def create_song(song: SongCreate, db: Session = Depends(get_db)):
    db_song = Song(**song.dict())
    db.add(db_song)
    db.commit()
    db.refresh(db_song)
    return db_song.to_dict()

@app.get("/api/songs/", response_model=List[SongResponse])
def read_songs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    songs = db.query(Song).offset(skip).limit(limit).all()
    return [song.to_dict() for song in songs]

@app.get("/api/songs/{song_id}", response_model=SongResponse)
def read_song(song_id: int, db: Session = Depends(get_db)):
    song = db.query(Song).filter(Song.id == song_id).first()
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    return song.to_dict()

@app.put("/api/songs/{song_id}", response_model=SongResponse)
def update_song(song_id: int, song: SongUpdate, db: Session = Depends(get_db)):
    db_song = db.query(Song).filter(Song.id == song_id).first()
    if db_song is None:
        raise HTTPException(status_code=404, detail="Song not found")

    update_data = song.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_song, key, value)

    db.commit()
    db.refresh(db_song)
    return db_song.to_dict()

@app.delete("/api/songs/{song_id}")
def delete_song(song_id: int, db: Session = Depends(get_db)):
    song = db.query(Song).filter(Song.id == song_id).first()
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")

    db.delete(song)
    db.commit()
    return {"message": "Song deleted successfully"}

@app.get("/api/hello")
def read_hello():
    return {"message": "Hello from FastAPI backend"}