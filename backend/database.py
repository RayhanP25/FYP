# backend/database.py
import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv() # This reads the .env file

DATABASE_URI = os.getenv("DATABASE_URI")
database_name = os.getenv("DATABASE_NAME")

# Ensure it's not None
if not DATABASE_URI:
    raise Exception("DATABASE_URI is not set in .env file")

client = MongoClient(DATABASE_URI, tlsAllowInvalidCertificates=True)