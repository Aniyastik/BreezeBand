from pydantic import BaseModel, Field
from typing import Optional

class TransactionCreate(BaseModel):
    nfc_uid: str
    vendor_id: int
    amount: float

class TransactionResponse(BaseModel):
    status: str
    message: str
    transaction_amount: float
    remaining_balance: float

class RegistrationCreate(BaseModel):
    user_name: str
    nfc_uid: str
    initial_balance: float = 0.0

class TransactionHistory(BaseModel):
    id: int
    amount: float
    status: str
    timestamp: str
    vendor_name: str

class SettlementResponse(BaseModel):
    status: str
    message: str
    total_settled: float

class TopUpRequest(BaseModel):
    nfc_uid: str
    amount: float

class DailyLoadRequest(BaseModel):
    nfc_uid: str
    amount: float  # Amount to pre-authorize / hold from the bank card

class DailyLoadResponse(BaseModel):
    status: str
    message: str
    wristband_balance: float
    bank_balance: float   # Real bank balance — shown for confirmation, NOT deducted
    daily_hold: float

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None          # New display name
    bank_account: Optional[str] = None  # New bank account number

# ── Family Wallets / RBAC ─────────────────────────────────────────────────────

class FamilyAccountCreate(BaseModel):
    """Register a parent wristband as master of a new family account."""
    master_nfc_uid: str
    family_name: str

class SubAccountCreate(BaseModel):
    """Link a child wristband to an existing family account."""
    master_nfc_uid: str
    child_nfc_uid: str
    child_name: str
    age: int = Field(..., ge=0, le=120)
    daily_spending_limit: float = Field(20.0, ge=0)

class FamilyTransactionResponse(BaseModel):
    status: str
    message: str
    account_type: str                    # "master" | "child" | "solo"
    transaction_amount: float
    remaining_balance: float             # master wallet balance after deduction
    child_daily_spend: Optional[float]   # None if master / solo
    child_daily_limit: Optional[float]
