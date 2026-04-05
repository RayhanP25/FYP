from fastapi import APIRouter, HTTPException
from database import client, database_name
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId
import bcrypt

router = APIRouter()

db = client[database_name]

class UserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    role: str
    profile_picture: str = None

@router.get("/users")
def get_users():
    users_collection = db["users"]
    users_list = list(users_collection.find({}))

    result = []
    for user in users_list:
        user['_id'] = str(user['_id'])
        result.append(user)

    return result

@router.post("/users")
def create_user(user_data: UserCreate):
    users_collection = db["users"]
    
    # Check if email already exists
    existing_user = users_collection.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    password_hash = bcrypt.hashpw(user_data.password.encode('utf-8'), bcrypt.gensalt())
    
    # Get current date
    current_date = datetime.now().strftime("%d.%m.%Y")
    
    # Create user document
    new_user = {
        "full_name": user_data.full_name,
        "email": user_data.email,
        "password_hash": password_hash.decode('utf-8'),
        "role": user_data.role,
        "profile_picture": user_data.profile_picture or "http://dummyimage.com/123x100.png/cc0000/ffffff",
        "created_at": current_date,
        "updated_at": current_date,
        "last_login": None
    }
    
    # Insert into database
    result = users_collection.insert_one(new_user)
    new_user['_id'] = str(result.inserted_id)
    
    # Remove password hash from response
    response_user = new_user.copy()
    response_user.pop('password_hash', None)
    
    return response_user

@router.delete("/users/{user_id}")
def delete_user(user_id: str):
    users_collection = db["users"]
    
    # Check if user exists
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete user from database
    users_collection.delete_one({"_id": ObjectId(user_id)})
    
    return {"message": "User deleted successfully"}