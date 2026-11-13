"""FoodTrack analysis service. Four narrow endpoints (06 §1), stateless, reads Postgres
as the same non-superuser app role with app.user_id set per transaction (06 §5)."""
from __future__ import annotations
from fastapi import FastAPI

app = FastAPI(title="FoodTrack analysis", docs_url=None, redoc_url=None)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
