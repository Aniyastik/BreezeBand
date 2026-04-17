from fastapi import FastAPI, Depends, HTTPException
import redis
from sqlalchemy.orm import Session

import models
import schemas
from database import engine, get_db

# Yeni Bank API Router-i və Celery fəhləsini import edirik
from bank_mock import router as bank_router
from worker import process_bank_settlement

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sea Breeze Mini-Economy Engine")

# Bank router-ni əlavə edirik
app.include_router(bank_router)

r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)


@app.get("/")
def read_root():
    return {"status": "Mühərrik işləyir", "redis_ping": r.ping()}


@app.get("/db-status")
def test_db_connection(db: Session = Depends(get_db)):
    vendors = db.query(models.Vendor).count()
    return {"status": "PostgreSQL işləyir", "vendors_count": vendors}


@app.post("/seed")
def seed_database(db: Session = Depends(get_db)):
    # Baza əvvəllər toxumlanıbsa xəta verməməsi üçün sadə yoxlama
    existing_user = db.query(models.User).filter(models.User.name == "Aniya").first()
    if existing_user:
        return {"status": "Toxumlar artıq əkilib!", "balance": r.get('wallet:A1-B2-C3-D4:balance')}

    user = models.User(name="Aniya")
    db.add(user)
    db.commit()
    
    nfc_uid = "A1-B2-C3-D4"
    wallet = models.Wallet(user_id=user.id, nfc_uid=nfc_uid, balance=200.0) # 200 AZN verək
    db.add(wallet)
    
    vendor = models.Vendor(name="Hovuz Bari", virtual_balance=0.0)
    db.add(vendor)
    db.commit()
    
    r.set(f"wallet:{nfc_uid}:balance", 200.0)
    
    return {"status": "Toxumlar səpildi!", "test_nfc_uid": nfc_uid, "vendor_id": vendor.id, "balance": 200.0}

# ==============================================================================
# HƏDƏF NÖQTƏSİ: Toxundur və Keç (Sıfır Ləngimə Mühərriki)
# ==============================================================================
@app.post("/pay", response_model=schemas.TransactionResponse)
def process_payment(payment: schemas.TransactionCreate):
    redis_key = f"wallet:{payment.nfc_uid}:balance"
    
    current_balance = r.get(redis_key)
    if current_balance is None:
        raise HTTPException(status_code=404, detail="Qolbaq tapılmadı və ya balans aktivləşdirilməyib")
        
    current_balance = float(current_balance)
    if current_balance < payment.amount:
        raise HTTPException(status_code=400, detail="Mövcud vəsait çatmır")
        
    new_balance = r.incrbyfloat(redis_key, -payment.amount)
    
    # 4. Asinxron olaraq CELERY-ə tapşırıq veririk
    # "BackgroundTasks" əvəzinə tam izolə olunmuş Celery broker-inə xəbər göndəririk
    process_bank_settlement.delay(payment.nfc_uid, payment.vendor_id, payment.amount)
    
    return {
        "status": "success",
        "message": "Ödəniş uğurla tamamlandı! (Bankda email edilir...)",
        "transaction_amount": payment.amount,
        "remaining_balance": round(new_balance, 2)
    }
