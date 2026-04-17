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
