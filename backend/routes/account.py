import io
import re
import uuid
from datetime import datetime
from typing import Optional

import bcrypt
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel

from avatars import AVATAR_BUCKET
from database import client, database_name
from minio_client import minio_client
from routes.users import create_access_token, get_current_user, set_auth_cookie

router = APIRouter(prefix="/me", tags=["account"])
db = client[database_name]

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
AVATAR_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_AVATAR_BYTES = 5 * 1024 * 1024
MIN_PASSWORD_LENGTH = 8


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class PasswordConfirm(BaseModel):
    password: str


def _user_doc(current_user):
    return db["users"].find_one({"_id": ObjectId(current_user["_id"])})


def _require_password(user, password):
    if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        raise HTTPException(status_code=400, detail="Wrong password")


@router.patch("")
def update_profile(body: ProfileUpdate, response: Response, current_user: dict = Depends(get_current_user)):
    updates = {}
    if body.full_name is not None:
        name = body.full_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name can't be empty")
        updates["full_name"] = name
    if body.email is not None:
        email = body.email.strip()
        if not EMAIL_PATTERN.match(email):
            raise HTTPException(status_code=400, detail="Enter a valid email address")
        if email != current_user["email"] and db["users"].find_one({"email": email}):
            raise HTTPException(status_code=400, detail="That email is already in use")
        updates["email"] = email
    if updates:
        db["users"].update_one({"_id": ObjectId(current_user["_id"])}, {"$set": updates})
    if "email" in updates:
        set_auth_cookie(response, create_access_token({"sub": updates["email"], "role": current_user["role"]}))
    return {"message": "Profile updated"}


@router.post("/picture")
async def upload_picture(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    extension = AVATAR_TYPES.get(file.content_type)
    if not extension:
        raise HTTPException(status_code=400, detail="Use a JPG, PNG or WebP picture")
    data = await file.read()
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Picture must be 5 MB or smaller")
    if not minio_client.bucket_exists(AVATAR_BUCKET):
        minio_client.make_bucket(AVATAR_BUCKET)
    key = f"{current_user['_id']}/{uuid.uuid4().hex}.{extension}"
    try:
        minio_client.put_object(AVATAR_BUCKET, key, io.BytesIO(data), len(data), content_type=file.content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save the picture: {e}")
    user_id = ObjectId(current_user["_id"])
    previous = db["users"].find_one_and_update({"_id": user_id}, {"$set": {"profile_picture_object": key}})
    if previous and previous.get("profile_picture_object"):
        try:
            minio_client.remove_object(AVATAR_BUCKET, previous["profile_picture_object"])
        except Exception:
            pass
    return {"message": "Picture updated"}


@router.put("/password")
def change_password(body: PasswordChange, current_user: dict = Depends(get_current_user)):
    user = _user_doc(current_user)
    _require_password(user, body.current_password)
    if len(body.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
    password_hash = bcrypt.hashpw(body.new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    db["users"].update_one({"_id": user["_id"]}, {"$set": {"password_hash": password_hash}})
    return {"message": "Password changed"}


@router.post("/delete")
def delete_account(body: PasswordConfirm, response: Response, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Admins can't delete their own account. Ask another admin.")
    user = _user_doc(current_user)
    _require_password(user, body.password)
    now = datetime.now()
    if user["role"] == "coach":
        group_ids = [str(g["_id"]) for g in db["groups"].find({"coach_id": str(user["_id"])}, {"_id": 1})]
        db["users"].update_many({"group_id": {"$in": group_ids}}, {"$set": {"group_id": None}})
        db["groups"].delete_many({"coach_id": str(user["_id"])})
    db["users"].update_one({"_id": user["_id"]}, {"$set": {"deactivated_at": now, "group_id": None}})
    response.delete_cookie("auth_token")
    return {"message": "Account deleted"}
