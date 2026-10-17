from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.sql import func
from database import Base
from sqlalchemy.orm import relationship

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

class DawProject(Base):
    __tablename__ = "daw_projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    tempo = Column(Integer, nullable=False, default=120)  # BPM
    time_signature = Column(String(10), nullable=False, default='4/4')
    transpose = Column(Integer, nullable=False, default=0)  # semitones
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationship to tracks
    tracks = relationship("DawTrack", back_populates="project", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "tempo": self.tempo,
            "time_signature": self.time_signature,
            "transpose": self.transpose,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "tracks": [track.to_dict() for track in self.tracks]
        }

class DawTrack(Base):
    __tablename__ = "daw_tracks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("daw_projects.id"), nullable=False)
    name = Column(String(200), nullable=False)
    audio_file_path = Column(String(500), nullable=False)  # path to the stored audio file
    volume = Column(Float, nullable=False, default=1.0)
    pan = Column(Float, nullable=False, default=0.0)
    muted = Column(Boolean, nullable=False, default=False)
    solo = Column(Boolean, nullable=False, default=False)
    clip_offset = Column(Float, nullable=False, default=0.0)  # start offset in seconds
    clip_duration = Column(Float, nullable=False)  # duration to play in seconds
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationship to project
    project = relationship("DawProject", back_populates="tracks")

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "name": self.name,
            "audio_file_path": self.audio_file_path,
            "volume": self.volume,
            "pan": self.pan,
            "muted": self.muted,
            "solo": self.solo,
            "clip_offset": self.clip_offset,
            "clip_duration": self.clip_duration,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }