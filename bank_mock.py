import asyncio
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import models
from database import get_db

router = APIRouter(prefix="/bank", tags=["Mock Bank"])

class BankChargeRequest(BaseModel):
    nfc_uid: str
    amount: float

@router.post("/charge")
async def process_bank_charge(request: BankChargeRequest, db: Session = Depends(get_db)):
    # Süni gecikmə - bankın sorğunu emal etməsini simulyasiya edirik
    await asyncio.sleep(1)
    
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == request.nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Qolbaq tapılmadı")
        
    bank_account = db.query(models.BankAccount).filter(models.BankAccount.user_id == wallet.user_id).first()
    if not bank_account:
        raise HTTPException(status_code=404, detail="Bank hesabı tapılmadı")
        
    if bank_account.balance < request.amount:
        return {"bank_status": "declined", "message": "Real bankda kifayət qədər vəsait yoxdur."}
        
    bank_account.balance -= request.amount
    db.commit()
    
    return {
        "bank_status": "approved",
        "nfc_uid": request.nfc_uid,
        "charged_amount": request.amount,
        "new_bank_balance": bank_account.balance,
        "message": f"Vəsait {bank_account.account_number} nömrəli kartdan uğurla silindi."
    }
