from datetime import timedelta

from minio_client import minio_client

AVATAR_BUCKET = "sport-pose-avatars"


def picture_url(user):
    key = user.get("profile_picture_object")
    if not key:
        return user.get("profile_picture")
    return minio_client.presigned_get_object(AVATAR_BUCKET, key, expires=timedelta(days=7))
