from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
import datetime

from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Əlaqələr
    wallet = relationship("Wallet", back_populates="owner", uselist=False)
    bank_account = relationship("BankAccount", back_populates="owner", uselist=False)


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    nfc_uid = Column(String, unique=True, index=True) # Qolbağın arxasında dayanan unikal stiker ID-si
    balance = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("User", back_populates="wallet")
    transactions = relationship("Transaction", back_populates="wallet")


class BankAccount(Base):
    __tablename__ = "bank_accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    account_number = Column(String, unique=True, index=True)
    balance = Column(Float, default=0.0) # Real bank balance
    
    owner = relationship("User", back_populates="bank_account")


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    virtual_balance = Column(Float, default=0.0) # Obyektin (restoranın) qazancı
    
    transactions = relationship("Transaction", back_populates="vendor")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    wallet_id = Column(Integer, ForeignKey("wallets.id"))
    vendor_id = Column(Integer, ForeignKey("vendors.id"))
    amount = Column(Float, nullable=False)
    status = Column(String, default="completed") # "pending", "completed", "failed"
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    wallet = relationship("Wallet", back_populates="transactions")
    vendor = relationship("Vendor", back_populates="transactions")
