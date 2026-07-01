from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
import os
from dotenv import load_dotenv

load_dotenv()

uri = os.getenv("DATBASE_URI")
database_name = os.getenv("DATABASE_NAME")

client = MongoClient(uri, server_api=ServerApi('1'))