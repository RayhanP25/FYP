from dotenv import load_dotenv
load_dotenv()  # Must be before everything else

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import client, database_name

# Import all your routers
from routes import users, ping, upload, pose, camera, obs_api

app = FastAPI(title="SportPose API")

# Database initialization
db = client[database_name]

# Allow React Frontend connections
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register standard API routes (adding the /api prefix)
app.include_router(ping.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(pose.router, prefix="/api")

# Register OBS and Camera routes
# (These already have prefix="/api/obs" and prefix="/api/camera" defined inside their files)
app.include_router(obs_api.router)
app.include_router(camera.router)

# To run the server:
r'''
cd .venv/Scripts
.\Activate.ps1
cd ../..
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
'''