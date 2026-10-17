import os
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from dependencies import get_db
from models import DawProject, DawTrack
from schemas.daw import (
    DawProjectCreate,
    DawProjectResponse,
    DawProjectUpdate,
    DawTrackResponse,
)

router = APIRouter()
UPLOAD_DIR = "./audio_uploads"


@router.post("/api/daw/projects/", response_model=DawProjectResponse)
def create_daw_project(project: DawProjectCreate, db: Session = Depends(get_db)):
    db_project = DawProject(**project.dict())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.get("/api/daw/projects/", response_model=List[DawProjectResponse])
def read_daw_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    projects = db.query(DawProject).offset(skip).limit(limit).all()
    return projects


@router.get("/api/daw/projects/{project_id}", response_model=DawProjectResponse)
def read_daw_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(DawProject).filter(DawProject.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/api/daw/projects/{project_id}", response_model=DawProjectResponse)
def update_daw_project(project_id: int, project: DawProjectUpdate, db: Session = Depends(get_db)):
    db_project = db.query(DawProject).filter(DawProject.id == project_id).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = project.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)

    db.commit()
    db.refresh(db_project)
    return db_project


@router.delete("/api/daw/projects/{project_id}")
def delete_daw_project(project_id: int, db: Session = Depends(get_db)):
    db_project = db.query(DawProject).filter(DawProject.id == project_id).first()
    if db_project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(db_project)
    db.commit()
    return {"message": "Project deleted successfully"}


@router.post("/api/daw/projects/{project_id}/tracks/", response_model=DawTrackResponse)
def create_daw_track(
    project_id: int,
    name: str,
    clip_duration: float,
    volume: float = 1.0,
    pan: float = 0.0,
    muted: bool = False,
    solo: bool = False,
    clip_offset: float = 0.0,
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    project = db.query(DawProject).filter(DawProject.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    file_location = f"{UPLOAD_DIR}/{audio_file.filename}"
    with open(file_location, "wb+") as file_object:
        file_object.write(audio_file.file.read())

    relative_path = audio_file.filename
    db_track = DawTrack(
        project_id=project_id,
        name=name,
        audio_file_path=relative_path,
        volume=volume,
        pan=pan,
        muted=muted,
        solo=solo,
        clip_offset=clip_offset,
        clip_duration=clip_duration,
    )
    db.add(db_track)
    db.commit()
    db.refresh(db_track)
    return db_track


@router.get("/api/daw/projects/{project_id}/tracks/", response_model=List[DawTrackResponse])
def read_daw_tracks(project_id: int, db: Session = Depends(get_db)):
    project = db.query(DawProject).filter(DawProject.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    tracks = db.query(DawTrack).filter(DawTrack.project_id == project_id).all()
    return tracks


@router.get("/api/daw/tracks/{track_id}", response_model=DawTrackResponse)
def read_daw_track(track_id: int, db: Session = Depends(get_db)):
    track = db.query(DawTrack).filter(DawTrack.id == track_id).first()
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return track


@router.put("/api/daw/tracks/{track_id}", response_model=DawTrackResponse)
def update_daw_track(
    track_id: int,
    name: Optional[str] = None,
    volume: Optional[float] = None,
    pan: Optional[float] = None,
    muted: Optional[bool] = None,
    solo: Optional[bool] = None,
    clip_offset: Optional[float] = None,
    clip_duration: Optional[float] = None,
    audio_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    db_track = db.query(DawTrack).filter(DawTrack.id == track_id).first()
    if db_track is None:
        raise HTTPException(status_code=404, detail="Track not found")

    if audio_file:
        old_file_path = f"{UPLOAD_DIR}/{db_track.audio_file_path}"
        if os.path.exists(old_file_path):
            os.remove(old_file_path)
        file_location = f"{UPLOAD_DIR}/{audio_file.filename}"
        with open(file_location, "wb+") as file_object:
            file_object.write(audio_file.file.read())
        db_track.audio_file_path = audio_file.filename

    if name is not None:
        db_track.name = name
    if volume is not None:
        db_track.volume = volume
    if pan is not None:
        db_track.pan = pan
    if muted is not None:
        db_track.muted = muted
    if solo is not None:
        db_track.solo = solo
    if clip_offset is not None:
        db_track.clip_offset = clip_offset
    if clip_duration is not None:
        db_track.clip_duration = clip_duration

    db.commit()
    db.refresh(db_track)
    return db_track


@router.delete("/api/daw/tracks/{track_id}")
def delete_daw_track(track_id: int, db: Session = Depends(get_db)):
    db_track = db.query(DawTrack).filter(DawTrack.id == track_id).first()
    if db_track is None:
        raise HTTPException(status_code=404, detail="Track not found")

    file_path = f"{UPLOAD_DIR}/{db_track.audio_file_path}"
    if os.path.exists(file_path):
        os.remove(file_path)

    db.delete(db_track)
    db.commit()
    return {"message": "Track deleted successfully"}
