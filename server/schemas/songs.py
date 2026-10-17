from typing import Optional

from pydantic import BaseModel


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
