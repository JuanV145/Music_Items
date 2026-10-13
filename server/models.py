from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from database import Base

class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    artist = Column(String(200), nullable=True)
    key_root = Column(String(10), nullable=False)  # e.g., "C", "G#", "Bb"
    key_mode = Column(String(2), nullable=False)   # "" for major, "m" for minor
    tempo = Column(String(10), nullable=False)     # BPM as string
    time_signature = Column(String(10), nullable=False)  # e.g., "4/4", "3/4"
    structure = Column(Text, nullable=True)        # JSON or text structure
    chords_lyrics = Column(Text, nullable=False)   # The actual song content
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "key_root": self.key_root,
            "key_mode": self.key_mode,
            "tempo": self.tempo,
            "time_signature": self.time_signature,
            "structure": self.structure,
            "chords_lyrics": self.chords_lyrics,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }