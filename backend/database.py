import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Define database and cover storage directories in the user's home directory
LIBRARIAN_DIR = Path.home() / ".librarian"
COVERS_DIR = LIBRARIAN_DIR / "covers"
BACKGROUNDS_DIR = LIBRARIAN_DIR / "backgrounds"

# Ensure directories exist
LIBRARIAN_DIR.mkdir(parents=True, exist_ok=True)
COVERS_DIR.mkdir(parents=True, exist_ok=True)
BACKGROUNDS_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = LIBRARIAN_DIR / "librarian.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# Create engine (check_same_thread=False is needed for SQLite under FastAPI)
engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
