from fastapi import APIRouter, HTTPException, Depends, Response, Cookie, status
from database import client, database_name
from pydantic import BaseModel
from bson import ObjectId
import bcrypt, os, jwt
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime, timedelta
from typing import List, Optional

from access import names


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

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="auth_token",
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        domain=None,
        secure=False,
        httponly=True,
        samesite="lax"
    )

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

class GroupIn(BaseModel):
    name: str
    coach_id: Optional[str] = None

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    coach_id: Optional[str] = None
    members_visible: Optional[bool] = None

class AthleteGroup(BaseModel):
    group_id: Optional[str] = None

class AthleteIds(BaseModel):
    athlete_ids: List[str]

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
    
    # Update last login (last_login_at / previous_login_at: full times, for "new since your last login")
    now = datetime.now()
    users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": now.strftime("%d.%m.%Y"), "last_login_at": now,
                  "previous_login_at": user.get("last_login_at") or user.get("last_login")}}
    )
    
    # Set HttpOnly cookie
    set_auth_cookie(response, access_token)
    
    # Return user info
    return {
        "user": {
            "_id": str(user["_id"]),
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"],
            "profile_picture": user.get("profile_picture"),
            **group_info(user)
        }
    }

@router.get("/me")
def get_current_user(response: Response, auth_token: Optional[str] = Cookie(None)):
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
    
    # Sliding session: every authenticated request extends the window, so an active user is never logged out mid-session.
    set_auth_cookie(response, create_access_token({"sub": user["email"], "role": user["role"]}))
    
    # Return user info
    return {
        "_id": str(user["_id"]),
        "full_name": user["full_name"],
        "email": user["email"],
        "role": user["role"],
        "profile_picture": user.get("profile_picture"),
        "created_at": user.get("created_at"),
        "last_login": user.get("last_login"),
        **group_info(user)
    }

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

def coach_name(coach_id):
    return names([coach_id]).get(coach_id) if coach_id else None

def _coach_or_400(coach_id):
    coach = db["users"].find_one({"_id": ObjectId(coach_id), "role": "coach"}) if ObjectId.is_valid(coach_id) else None
    if not coach:
        raise HTTPException(status_code=400, detail="Coach not found")
    return coach

def _group_doc(group_id):
    return db["groups"].find_one({"_id": ObjectId(group_id)}) if group_id and ObjectId.is_valid(group_id) else None

def group_info(user):
    group = _group_doc(user.get("group_id"))
    return dict(group_id=str(group["_id"]) if group else None, group_name=group.get("name") if group else None,
                coach_id=group.get("coach_id") if group else None,
                coach_name=coach_name(group.get("coach_id")) if group else None)

def _require_coach_or_admin(user):
    if user.get("role") not in ("admin", "coach"):
        raise HTTPException(status_code=403, detail="Coach or admin access required")

def _manageable(user, group):
    return user.get("role") == "admin" or (user.get("role") == "coach" and group.get("coach_id") == str(user["_id"]))

def _athlete_row(u):
    return dict(id=str(u["_id"]), full_name=u.get("full_name"), email=u.get("email"))

@router.get("/groups")
def get_groups(current_user: dict = Depends(get_current_user)):
    _require_coach_or_admin(current_user)
    coach_query = {"role": "coach"} if current_user.get("role") == "admin" else {"role": "coach", "_id": ObjectId(current_user["_id"])}
    coaches = list(db["users"].find(coach_query, {"full_name": 1, "email": 1}).sort("full_name", 1))
    groups = list(db["groups"].find({"coach_id": {"$in": [str(c["_id"]) for c in coaches]}}).sort("name", 1))
    members = {}
    for a in db["users"].find({"role": "athlete", "group_id": {"$in": [str(g["_id"]) for g in groups]}}).sort("full_name", 1):
        members.setdefault(a["group_id"], []).append(_athlete_row(a))
    by_coach = {}
    for g in groups:
        by_coach.setdefault(g["coach_id"], []).append(
            dict(id=str(g["_id"]), name=g["name"], coach_id=g["coach_id"], members_visible=bool(g.get("members_visible")),
                 athletes=members.get(str(g["_id"]), [])))
    return dict(
        coaches=[dict(id=str(c["_id"]), full_name=c.get("full_name"), email=c.get("email"),
                      groups=by_coach.get(str(c["_id"]), [])) for c in coaches],
        unassigned=[_athlete_row(a) for a in db["users"].find({"role": "athlete", "group_id": None}).sort("full_name", 1)])

@router.post("/groups")
def create_group(body: GroupIn, current_user: dict = Depends(get_current_user)):
    _require_coach_or_admin(current_user)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")
    coach_id = str(current_user["_id"]) if current_user.get("role") == "coach" else body.coach_id
    _coach_or_400(coach_id or "")
    result = db["groups"].insert_one({"name": name, "coach_id": coach_id, "members_visible": False})
    return dict(id=str(result.inserted_id), name=name, coach_id=coach_id, members_visible=False, athletes=[])

@router.put("/groups/{group_id}")
def update_group(group_id: str, body: GroupUpdate, current_user: dict = Depends(get_current_user)):
    _require_coach_or_admin(current_user)
    group = _group_doc(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _manageable(current_user, group):
        raise HTTPException(status_code=403, detail="You can only change your own groups.")
    updates = {}
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Group name is required")
        updates["name"] = name
    if body.coach_id is not None:
        if current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can move a group to another coach.")
        _coach_or_400(body.coach_id)
        updates["coach_id"] = body.coach_id
    if body.members_visible is not None:
        updates["members_visible"] = body.members_visible
    if updates:
        db["groups"].update_one({"_id": group["_id"]}, {"$set": updates})
    return dict(id=group_id, name=updates.get("name", group["name"]), coach_id=updates.get("coach_id", group["coach_id"]),
                members_visible=updates.get("members_visible", bool(group.get("members_visible"))))

@router.get("/my-group")
def get_my_group(current_user: dict = Depends(get_current_user)):
    me = db["users"].find_one({"_id": ObjectId(current_user["_id"])}, {"group_id": 1})
    group = _group_doc(me.get("group_id"))
    if not group:
        return {"group": None}
    fields = {"full_name": 1, "email": 1, "profile_picture": 1}
    coach = db["users"].find_one({"_id": ObjectId(group["coach_id"])}, fields)
    members = []
    if group.get("members_visible"):
        members = list(db["users"].find({"role": "athlete", "group_id": str(group["_id"])}, fields).sort("full_name", 1))
    person = lambda u: dict(id=str(u["_id"]), full_name=u.get("full_name"), email=u.get("email"), profile_picture=u.get("profile_picture"))
    return {"group": dict(id=str(group["_id"]), name=group["name"], members_visible=bool(group.get("members_visible")),
                          coach=person(coach), members=[person(m) for m in members])}

@router.delete("/groups/{group_id}")
def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    _require_coach_or_admin(current_user)
    group = _group_doc(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _manageable(current_user, group):
        raise HTTPException(status_code=403, detail="You can only delete your own groups.")
    db["users"].update_many({"group_id": group_id}, {"$set": {"group_id": None}})
    db["groups"].delete_one({"_id": group["_id"]})
    return {"message": "Group deleted"}

@router.post("/groups/{group_id}/athletes")
def add_athletes_to_group(group_id: str, body: AthleteIds, current_user: dict = Depends(get_current_user)):
    _require_coach_or_admin(current_user)
    group = _group_doc(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not _manageable(current_user, group):
        raise HTTPException(status_code=403, detail="You can only add athletes to your own groups.")
    oids = [ObjectId(i) for i in body.athlete_ids if ObjectId.is_valid(i)]
    athletes = list(db["users"].find({"_id": {"$in": oids}, "role": "athlete"}, {"group_id": 1}))
    if current_user.get("role") == "coach":
        for a in athletes:
            current = _group_doc(a.get("group_id"))
            if current and not _manageable(current_user, current):
                raise HTTPException(status_code=403, detail="Some of these athletes are in another coach's group.")
    db["users"].update_many({"_id": {"$in": [a["_id"] for a in athletes]}}, {"$set": {"group_id": group_id}})
    return {"added": len(athletes)}

@router.put("/athletes/{athlete_id}/group")
def set_athlete_group(athlete_id: str, body: AthleteGroup, current_user: dict = Depends(get_current_user)):
    _require_coach_or_admin(current_user)
    athlete = db["users"].find_one({"_id": ObjectId(athlete_id), "role": "athlete"}) if ObjectId.is_valid(athlete_id) else None
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    target = _group_doc(body.group_id) if body.group_id else None
    if body.group_id and not target:
        raise HTTPException(status_code=404, detail="Group not found")
    if current_user.get("role") == "coach":
        current = _group_doc(athlete.get("group_id"))
        if any(g and not _manageable(current_user, g) for g in (current, target)):
            raise HTTPException(status_code=403, detail="You can only move athletes within your own groups.")
    new_group_id = str(target["_id"]) if target else None
    db["users"].update_one({"_id": athlete["_id"]}, {"$set": {"group_id": new_group_id}})
    return {"athlete_id": athlete_id, "group_id": new_group_id}

@router.get("/users")
def get_users(current_user: dict = Depends(require_admin)):
    users_collection = db["users"]
    users_list = list(users_collection.find({}))
    groups = {str(g["_id"]): g for g in db["groups"].find({})}
    coach_names = names([g["coach_id"] for g in groups.values()])

    result = []
    for user in users_list:
        user['_id'] = str(user['_id'])
        group = groups.get(user.get("group_id"))
        user['group_name'] = group["name"] if group else None
        user['coach_name'] = coach_names.get(group["coach_id"]) if group else None
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
    group_ids = [str(g["_id"]) for g in db["groups"].find({"coach_id": user_id}, {"_id": 1})]
    db["groups"].delete_many({"coach_id": user_id})
    users_collection.update_many({"group_id": {"$in": group_ids}}, {"$set": {"group_id": None}})
    
    return {"message": "User deleted successfully"}

@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("auth_token")
    return {"message": "Logged out successfully"}
