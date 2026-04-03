from fastapi import APIRouter
from database import client, database_name

router = APIRouter()

db = client[database_name]

@router.get("/users")
def get_users():
    users_collection = db["users"]
    users_list = list(users_collection.find({}))

    result = []
    for user in users_list:
        user['_id'] = str(user['_id'])
        result.append(user)

    return result