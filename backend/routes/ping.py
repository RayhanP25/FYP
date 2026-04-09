from fastapi import APIRouter
from database import client

router = APIRouter()

@router.get("/ping")
def ping_database():
    client.admin.command('ping')
    return {"success": True}