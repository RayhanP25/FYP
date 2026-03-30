from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import client, database_name

# cd backend/.venv/Scripts
# .\Activate.ps1
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

@app.get("/api/ping")
def ping_database():
    try:
        client.admin.command('ping')
        return {
            "success": True,
            "message": "Pinged your deployment. Successfully connected to MongoDB"
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e)
        }

@app.get("/api/users")
def get_users():
    try:
        users_collection = db["users"]
        
        users_list = list(users_collection.find({}))
        
        result = []
        for user in users_list:
            user['_id'] = str(user['_id'])
            result.append(user)
        return result
    
    except Exception as e:
        return {"success": False, "message": str(e)}
