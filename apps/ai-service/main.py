"""SIMU · CDMX — AI service wrapper.

Exposes POST /ai/analyze with the same contract the API expects. The real vision
pipeline lives in a separate Python repository; until it is wired in (ANALYZER_BACKEND
= "external"), this service returns mock detections with random confidence.

Privacy by design: the analyzer only reports urban-infrastructure classes. It never
returns people, faces, plates or any identifier, and it does not persist frames.
"""

from __future__ import annotations

import os
import random
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

EventType = Literal[
    "WATER_ACCUMULATION",
    "DRAIN_OBSTRUCTION",
    "ACCIDENT",
    "OBSTACLE",
    "INFRASTRUCTURE_FAILURE",
    "ACCESSIBILITY_BLOCK",
]
Priority = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]

DEFAULT_PRIORITY: dict[str, Priority] = {
    "WATER_ACCUMULATION": "HIGH",
    "DRAIN_OBSTRUCTION": "MEDIUM",
    "ACCIDENT": "HIGH",
    "OBSTACLE": "MEDIUM",
    "INFRASTRUCTURE_FAILURE": "MEDIUM",
    "ACCESSIBILITY_BLOCK": "MEDIUM",
}

BACKEND = os.getenv("ANALYZER_BACKEND", "mock")

app = FastAPI(title="SIMU AI service", version="0.1.0")


class AnalyzeRequest(BaseModel):
    device_id: str = Field(pattern=r"^CAM-\d{3}$")
    location_id: str | None = None
    # Opaque reference to a frame held by the bridge app. Raw images are never sent here.
    frame_ref: str | None = None
    # Lets the simulator force a class for demo scenarios.
    hint: EventType | None = None


class Detection(BaseModel):
    device_id: str
    event_type: EventType
    confidence: float = Field(ge=0, le=1)
    location_id: str | None
    priority: Priority
    analyzed_at: str
    backend: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "simu-ai", "backend": BACKEND}


@app.post("/ai/analyze", response_model=Detection)
def analyze(req: AnalyzeRequest) -> Detection:
    if BACKEND != "mock":
        raise HTTPException(status_code=501, detail=f"Backend '{BACKEND}' no implementado")
    event_type: EventType = req.hint or random.choice(list(DEFAULT_PRIORITY.keys()))  # type: ignore[assignment]
    return Detection(
        device_id=req.device_id,
        event_type=event_type,
        confidence=round(random.uniform(0.6, 0.98), 3),
        location_id=req.location_id,
        priority=DEFAULT_PRIORITY[event_type],
        analyzed_at=datetime.now(timezone.utc).isoformat(),
        backend=BACKEND,
    )
