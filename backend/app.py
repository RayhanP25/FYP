from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import client, database_name
from routes import users, ping, upload

# cd .venv/Scripts
# .\Activate.ps1
# cd ../..
# uvicorn app:app --host 0.0.0.0 --port 8000 --reload

app = FastAPI()

db = client[database_name]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ping.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(upload.router, prefix="/api")

