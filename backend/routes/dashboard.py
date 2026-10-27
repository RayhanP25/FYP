"""
dashboard.py -- numbers for the Home page.

GET /api/dashboard
    Admins see every user's videos, everyone else their own (like /my-videos).
    totals          videos (uploads + stereo recordings), stereo recordings, analysed
    last_login      the login before this one (sessions end after ACCESS_TOKEN_EXPIRE_MINUTES idle)
    new_since_login videos added after that login (newest first)
    per_user        videos and recordings per user (admins only)
    recent          the latest videos

Coaches / athletes: per_user lists each user with their role; grouping athletes under their coach
can be added here once users carry that link.
"""
from datetime import datetime

from fastapi import APIRouter, Depends

from database import client, database_name
from routes.users import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
db = client[database_name]
LIST_LIMIT = 10


def _when(video):
    t = video.get("uploaded_at") or video.get("created_at")
    return t if isinstance(t, datetime) else None


def _iso(t):
    return t.isoformat(timespec="seconds") if isinstance(t, datetime) else None


def _is_recording(video):
    return video.get("source") == "stereo_camera" or video.get("layout") == "side_by_side"


def _date(value):
    """A stored login time: a datetime, or a dd.mm.yyyy date from before full times were kept."""
    if isinstance(value, datetime):
        return value
    try:
        return datetime.strptime(value, "%d.%m.%Y") if value else None
    except (TypeError, ValueError):
        return None


def _previous_login(user):
    """The login before the current session."""
    if "previous_login_at" in user:
        return _date(user["previous_login_at"])
    return _date(user.get("last_login"))           # not logged in since this was added


@router.get("")
def dashboard(current_user: dict = Depends(get_current_user)):
    is_admin = current_user.get("role") == "admin"
    me = db["users"].find_one({"email": current_user["email"]}) or {}
    scope = {} if is_admin else {"user_id": str(current_user["_id"])}

    videos = list(db["videos"].find(scope, {"original_filename": 1, "filename": 1, "object_name": 1, "uploaded_at": 1,
                                            "created_at": 1, "user_id": 1, "source": 1, "layout": 1,
                                            "frames": 1, "fps": 1}))
    ids = [str(v["_id"]) for v in videos]
    analysed = {a["video_id"] for a in db["pose_analysis"].find({"video_id": {"$in": ids}}, {"video_id": 1})}
    users = {str(u["_id"]): u for u in db["users"].find({}, {"full_name": 1, "role": 1, "email": 1})}

    def row(v):
        who = users.get(v.get("user_id"), {})
        frames, fps = v.get("frames"), v.get("fps")
        return dict(
            video_id=str(v["_id"]),
            name=v.get("original_filename") or v.get("filename") or v.get("object_name", "Untitled video"),
            uploaded_at=_iso(_when(v)),
            recorded_by=who.get("full_name"), recorded_by_role=who.get("role"),
            kind="recording" if _is_recording(v) else "upload",
            duration_s=round(frames / fps, 1) if frames and fps else None,
            analysed=str(v["_id"]) in analysed,
        )

    newest_first = sorted(videos, key=lambda v: _when(v) or datetime.min, reverse=True)
    since = _previous_login(me)
    new = [v for v in newest_first if since and _when(v) and _when(v) > since]

    per_user = []
    if is_admin:
        counts = {}
        for v in videos:
            c = counts.setdefault(v.get("user_id"), dict(videos=0, recordings=0, analysed=0, last=None))
            c["videos"] += 1
            c["recordings"] += _is_recording(v)
            c["analysed"] += str(v["_id"]) in analysed
            if _when(v) and (c["last"] is None or _when(v) > c["last"]):
                c["last"] = _when(v)
        for uid, c in counts.items():
            u = users.get(uid, {})
            per_user.append(dict(user_id=uid, name=u.get("full_name") or "Unknown user", role=u.get("role"),
                                 videos=c["videos"], recordings=c["recordings"], analysed=c["analysed"],
                                 last_upload=_iso(c["last"])))
        per_user.sort(key=lambda r: (-r["videos"], r["name"]))

    return dict(
        scope="all" if is_admin else "mine",
        totals=dict(videos=len(videos), recordings=sum(map(_is_recording, videos)), analysed=len(analysed)),
        last_login=_iso(since),
        new_since_login=dict(count=len(new), videos=[row(v) for v in new[:LIST_LIMIT]]),
        per_user=per_user,
        recent=[row(v) for v in newest_first[:LIST_LIMIT]],
    )
