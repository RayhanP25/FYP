import os
import sys

from dotenv import load_dotenv
from minio import Minio
from minio.error import S3Error

load_dotenv()

from minio_client import minio_client

PART_SIZE = 10 * 1024 * 1024


def main():
    src_endpoint, src_access, src_secret = sys.argv[1:4]
    bucket = sys.argv[4] if len(sys.argv) > 4 else os.getenv("MINIO_BUCKET", "sport-pose-videos")
    source = Minio(src_endpoint, access_key=src_access, secret_key=src_secret, secure=False)

    copied = skipped = 0
    for obj in source.list_objects(bucket, recursive=True):
        try:
            minio_client.stat_object(bucket, obj.object_name)
            skipped += 1
            print(f"skip (already there): {obj.object_name}")
            continue
        except S3Error:
            pass

        response = source.get_object(bucket, obj.object_name)
        try:
            minio_client.put_object(
                bucket_name=bucket,
                object_name=obj.object_name,
                data=response,
                length=obj.size,
                part_size=PART_SIZE,
                content_type=response.headers.get("Content-Type", "application/octet-stream"),
            )
        finally:
            response.close()
            response.release_conn()
        copied += 1
        print(f"copied: {obj.object_name} ({obj.size / 1024 / 1024:.1f} MB)")

    print(f"done: {copied} copied, {skipped} skipped")


if __name__ == "__main__":
    main()
