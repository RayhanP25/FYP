"""Who can see and act on which user's videos."""
from bson import ObjectId

from database import client, database_name

db = client[database_name]


def _me(user):
    return str(user["_id"])


def coach_of(user_doc):
    gid = user_doc.get("group_id")
    group = db["groups"].find_one({"_id": ObjectId(gid)}, {"coach_id": 1}) if gid and ObjectId.is_valid(gid) else None
    return group.get("coach_id") if group else None


def roster_ids(coach_id):
    group_ids = [str(g["_id"]) for g in db["groups"].find({"coach_id": coach_id}, {"_id": 1})]
    return [str(u["_id"]) for u in db["users"].find({"role": "athlete", "group_id": {"$in": group_ids}}, {"_id": 1})]


def visible_owner_ids(user):
    """Owner ids whose videos this user may see; None means every owner (admin)."""
    role = user.get("role")
    if role == "admin":
        return None
    if role == "coach":
        return [_me(user)] + roster_ids(_me(user))
    return [_me(user)]


def can_access_owner(user, owner_id):
    if user.get("role") == "admin" or owner_id == _me(user):
        return True
    if user.get("role") != "coach" or not ObjectId.is_valid(owner_id):
        return False
    owner = db["users"].find_one({"_id": ObjectId(owner_id)}, {"group_id": 1})
    return bool(owner) and coach_of(owner) == _me(user)


def can_access_video(user, video_doc):
    return can_access_owner(user, video_doc.get("user_id"))


def can_access_analysis(user, analysis_doc):
    return can_access_owner(user, analysis_doc.get("user_id"))


def names(ids):
    """{user id: full name} for the given ids; ids of deleted accounts map to "Deleted user"."""
    valid = {i for i in ids if i and ObjectId.is_valid(i)}
    found = {str(u["_id"]): u.get("full_name") for u in db["users"].find({"_id": {"$in": [ObjectId(i) for i in valid]}}, {"full_name": 1})}
    return {i: found.get(i, "Deleted user") for i in valid}
