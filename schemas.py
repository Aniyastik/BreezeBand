from pydantic import BaseModel

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
