from fastapi import APIRouter, HTTPException, Depends, Response, Cookie, status
from database import client, database_name
from pydantic import BaseModel
from bson import ObjectId
import bcrypt, os, jwt
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta
from typing import Optional


router = APIRouter()
db = client[database_name]

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY environment variable not set")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))
if not ACCESS_TOKEN_EXPIRE_MINUTES:
    raise RuntimeError("ACCESS_TOKEN_EXPIRE_MINUTES environment variable is not set")

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

class UserCreate(BaseModel):
    full_name: str
    email: str
    password: str
    role: str
    profile_picture: str = None

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    _id: str
    full_name: str
    email: str
    role: str
    profile_picture: Optional[str] = None

@router.post("/login")
def login(user_credentials: UserLogin, response: Response):
    users_collection = db["users"]
    
    # Find user by email
    user = users_collection.find_one({"email": user_credentials.email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Verify password
    if not bcrypt.checkpw(user_credentials.password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Create access token
    token_data = {"sub": user["email"], "role": user["role"]}
    access_token = create_access_token(token_data)
    
    # Update last login
    users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.now().strftime("%d.%m.%Y")}}
    )
    
    # Set HttpOnly cookie
    response.set_cookie(
        key="auth_token",
        value=access_token,
        max_age=1800,
        path="/",
        domain=None,
        secure=False,
        httponly=True,
        samesite="lax"
    )
    
    # Return user info
    return {
        "user": {
            "_id": str(user["_id"]),
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"],
            "profile_picture": user.get("profile_picture")
        }
    }

@router.get("/me")
def get_current_user(auth_token: Optional[str] = Cookie(None)):
    # Get token from cookie
    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No authentication token provided"
        )
    
    # Verify token
    payload = verify_token(auth_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    # Get user from database
    users_collection = db["users"]
    user = users_collection.find_one({"email": payload.get("sub")})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Return user info
    return {
        "_id": str(user["_id"]),
        "full_name": user["full_name"],
        "email": user["email"],
        "role": user["role"],
        "profile_picture": user.get("profile_picture"),
        "created_at": user.get("created_at"),
        "last_login": user.get("last_login")
    }

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

@router.get("/users")
def get_users(current_user: dict = Depends(require_admin)):
    users_collection = db["users"]
    users_list = list(users_collection.find({}))

    result = []
    for user in users_list:
        user['_id'] = str(user['_id'])
        result.append(user)

    return result

@router.post("/users")
def create_user(user_data: UserCreate, current_user: dict = Depends(require_admin)):
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
def delete_user(user_id: str, current_user: dict = Depends(require_admin)):
    users_collection = db["users"]
    
    # Check if user exists
    user = users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete user from database
    users_collection.delete_one({"_id": ObjectId(user_id)})
    
    return {"message": "User deleted successfully"}

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("auth_token")
    return {"message": "Logged out successfully"}
