from typing import List, Optional

from pydantic import BaseModel


class DawProjectBase(BaseModel):
    name: str
    tempo: int = 120
    time_signature: str = "4/4"
    transpose: int = 0


class DawProjectCreate(DawProjectBase):
    pass


class DawProjectUpdate(BaseModel):
    name: Optional[str] = None
    tempo: Optional[int] = None
    time_signature: Optional[str] = None
    transpose: Optional[int] = None


class DawTrackBase(BaseModel):
    name: str
    audio_file_path: str
    volume: float = 1.0
    pan: float = 0.0
    muted: bool = False
    solo: bool = False
    clip_offset: float = 0.0
    clip_duration: float


class DawTrackCreate(DawTrackBase):
    pass


class DawTrackUpdate(BaseModel):
    name: Optional[str] = None
    audio_file_path: Optional[str] = None
    volume: Optional[float] = None
    pan: Optional[float] = None
    muted: Optional[bool] = None
    solo: Optional[bool] = None
    clip_offset: Optional[float] = None
    clip_duration: Optional[float] = None


class DawTrackResponse(DawTrackBase):
    id: int
    project_id: int
    created_at: str
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


class DawProjectResponse(DawProjectBase):
    id: int
    created_at: str
    updated_at: Optional[str] = None
    tracks: List["DawTrackResponse"] = []

    class Config:
        from_attributes = True


DawProjectResponse.model_rebuild()
