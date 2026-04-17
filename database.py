from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Docker-da qurduğumuz PostgreSQL bazasının URL-i
SQLALCHEMY_DATABASE_URL = "postgresql://admin:secretpassword@localhost:5432/seabreeze_db"

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
