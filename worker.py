import httpx
from celery import Celery
import models
from database import get_db

# Mövcud Redis konteynerimizdən həm broker, həm də neticə mərkəzi (backend) kimi istifadə edirik
celery_app = Celery(
    "tasks",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/0"
)

@celery_app.task(name="worker.process_bank_settlement")
def process_bank_settlement(nfc_uid: str, vendor_id: int, amount: float):
    print(f"[CELERY] Tapşırıq başladı: {nfc_uid} nömrəli qolbaqdan {amount} AZN çıxılır...")
    
    # 1. DB-də tranzaksiyanı qeyd edirik (Sinxron rejimdə)
    db = next(get_db())
    try:
        wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
        vendor = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
        
        if wallet and vendor:
            wallet.balance -= amount
            vendor.virtual_balance += amount
            
            new_tx = models.Transaction(
                wallet_id=wallet.id,
                vendor_id=vendor.id,
                amount=amount,
                status="pending_bank" # Bank prosesi bitməyib deyə gözləmədə qalır
            )
            db.add(new_tx)
            db.commit()
            tx_id = new_tx.id
        else:
            return "Qolbaq və ya Vendor tapılmadı"
    finally:
        db.close()

    # 2. Bankın API-nə müraciət edirik
    response = httpx.post(
        "http://127.0.0.1:8000/bank/charge", 
        json={"nfc_uid": nfc_uid, "amount": amount},
        timeout=10.0
    )
    
    if response.status_code == 200 and response.json().get("bank_status") == "approved":
        # 3. Pul kartdan uğurla çəkildisə, bazadakı statusu "completed" edirik
        db = next(get_db())
        try:
            tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id).first()
            if tx:
                tx.status = "completed"
                db.commit()
                print(f"[CELERY] Təsdiqləndi: {amount} AZN bankdan çəkildi!")
        finally:
            db.close()
    
    return response.json()
