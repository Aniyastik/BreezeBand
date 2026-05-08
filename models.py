from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Date
from sqlalchemy.orm import relationship
import datetime

from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_admin = Column(Boolean, default=False)

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
    category = Column(String, index=True, default="General")
    virtual_balance = Column(Float, default=0.0) # Obyektin (restoranın) qazancı
    age_restricted = Column(Boolean, default=False)  # True = 18+ only (bars, etc.)

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


# ── Family Wallets / RBAC ─────────────────────────────────────────────────────

class FamilyAccount(Base):
    """
    One per family visit. The parent's Wallet IS the central balance pool.
    All child spending is deducted from master_wallet.balance.
    """
    __tablename__ = "family_accounts"

    id               = Column(Integer, primary_key=True, index=True)
    master_wallet_id = Column(Integer, ForeignKey("wallets.id"), unique=True, nullable=False)
    family_name      = Column(String, nullable=False)
    created_at       = Column(DateTime, default=datetime.datetime.utcnow)

    master_wallet = relationship("Wallet", foreign_keys=[master_wallet_id])
    sub_accounts  = relationship("SubAccount", back_populates="family")


class SubAccount(Base):
    """
    One row per child wristband. The child wallet balance is always 0;
    all charges are pulled from the linked FamilyAccount master wallet.
    """
    __tablename__ = "sub_accounts"

    id                   = Column(Integer, primary_key=True, index=True)
    family_id            = Column(Integer, ForeignKey("family_accounts.id"), nullable=False)
    child_wallet_id      = Column(Integer, ForeignKey("wallets.id"), unique=True, nullable=False)
    child_name           = Column(String, nullable=False)
    age                  = Column(Integer, nullable=False)

    # Spending controls
    daily_spending_limit = Column(Float, default=20.0)           # AZN per day
    current_daily_spend  = Column(Float, default=0.0)            # resets each calendar day
    spend_reset_date     = Column(Date,  default=datetime.date.today)

    family       = relationship("FamilyAccount", back_populates="sub_accounts")
    child_wallet = relationship("Wallet", foreign_keys=[child_wallet_id])
