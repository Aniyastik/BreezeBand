from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import os

# Docker-da qurduğumuz PostgreSQL bazasının URL-i və ya serverdən gələn evironment
DATABASE_URL_ENV = os.environ.get("DATABASE_URL", "postgresql://admin:secretpassword@localhost:5432/seabreeze_db")
if DATABASE_URL_ENV and DATABASE_URL_ENV.startswith("postgres://"):
    DATABASE_URL_ENV = DATABASE_URL_ENV.replace("postgres://", "postgresql://", 1)

SQLALCHEMY_DATABASE_URL = DATABASE_URL_ENV

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Bazaya asinxron və ya sinxron qoşulma sessiyasını verən funksiya
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
