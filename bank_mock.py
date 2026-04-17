import asyncio
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/bank", tags=["Mock Bank"])

class BankChargeRequest(BaseModel):
    nfc_uid: str
    amount: float

@router.post("/charge")
async def process_bank_charge(request: BankChargeRequest):
    # Süni gecikmə - bankın (məsələn, Kapital Bank və ya eManat) sorğunu emal etməsini simulyasiya edirik
    await asyncio.sleep(3)
    
    # Real ssenaridə burada Visa/Mastercard API-yə müraciət gedərdi.
    # Uğurla tamamlandığını göstəririk
    return {
        "bank_status": "approved",
        "nfc_uid": request.nfc_uid,
        "charged_amount": request.amount,
        "message": "Vəsait kartdan arxa planda uğurla silindi."
    }
