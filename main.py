from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import redis
import httpx
import asyncio
import random
from datetime import datetime
from sqlalchemy.orm import Session

import models
import schemas
from database import engine, get_db

# Yeni Bank API Router-i və Celery fəhləsini import edirik
from bank_mock import router as bank_router
from worker import process_bank_settlement

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sea Breeze Mini-Economy Engine")

async def run_daily_settlement():
    while True:
        await asyncio.sleep(120) # 2 dəqiqədə bir test üçün
        print(f"[{datetime.now()}] AVTOMATİK GÜNÜN SONU HESABLAŞMASI BAŞLADI...")
        db = next(get_db())
        try:
            settle_day(db)
        except Exception as e:
            print(f"Hesablaşma xətası: {e}")
        finally:
            db.close()

@app.on_event("startup")
async def start_scheduler():
    asyncio.create_task(run_daily_settlement())

# CORS tənzimləmələri
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Bank router-ni əlavə edirik
app.include_router(bank_router)

# Static files (POS terminal)
app.mount("/static", StaticFiles(directory="static"), name="static")

r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)


@app.get("/")
def read_root():
    return {"status": "Mühərrik işləyir", "redis_ping": r.ping()}


@app.get("/pos")
def pos_terminal():
    """Serve the POS terminal page for Android NFC payments."""
    return FileResponse("static/pos.html")


@app.get("/vendors")
def list_vendors(db: Session = Depends(get_db)):
    """List all vendors for the POS dropdown."""
    vendors = db.query(models.Vendor).all()
    return [{"id": v.id, "name": v.name, "virtual_balance": v.virtual_balance} for v in vendors]


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

@app.post("/register_nfc")
def register_nfc(data: schemas.RegistrationCreate, db: Session = Depends(get_db)):
    # Yoxlayaq istifadəçi varmı
    user = db.query(models.User).filter(models.User.name == data.user_name).first()
    if not user:
        user = models.User(name=data.user_name)
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Real bank hesabı yaradırıq
        bank_account = models.BankAccount(
            user_id=user.id, 
            account_number=f"AZ{random.randint(1000,9999)}0000{random.randint(1000,9999)}", 
            balance=5000.0 # İlkin bank balansı (real pul)
        )
        db.add(bank_account)
        db.commit()
    
    # Qolbaq varmı
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == data.nfc_uid).first()
    if wallet:
        if wallet.user_id != user.id:
            raise HTTPException(status_code=400, detail="Bu qolbaq başqa istifadəçiyə aiddir!")
        # Balansı artır
        wallet.balance += data.initial_balance
    else:
        wallet = models.Wallet(user_id=user.id, nfc_uid=data.nfc_uid, balance=data.initial_balance)
        db.add(wallet)
    
    db.commit()
    db.refresh(wallet)
    
    # Redis-i yenilə
    r.set(f"wallet:{data.nfc_uid}:balance", wallet.balance)
    
    return {"status": "success", "message": "Qolbaq qeydiyyata alındı!", "balance": wallet.balance}

# ==============================================================================
# HƏDƏF NÖQTƏSİ: Toxundur və Keç (Sıfır Ləngimə Mühərriki)
# ==============================================================================
@app.post("/pay", response_model=schemas.TransactionResponse)
def process_payment(payment: schemas.TransactionCreate, db: Session = Depends(get_db)):
    redis_key = f"wallet:{payment.nfc_uid}:balance"
    
    current_balance = r.get(redis_key)
    if current_balance is None:
        raise HTTPException(status_code=404, detail="Qolbaq tapılmadı və ya balans aktivləşdirilməyib")
        
    current_balance = float(current_balance)
    if current_balance < payment.amount:
        raise HTTPException(status_code=400, detail="Mövcud vəsait çatmır")
        
    # Redis-dən dərhal çıxırıq (sürət üçün)
    new_balance = r.incrbyfloat(redis_key, -payment.amount)
    
    # Baza əməliyyatları
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == payment.nfc_uid).first()
    vendor = db.query(models.Vendor).filter(models.Vendor.id == payment.vendor_id).first()
    
    if wallet and vendor:
        wallet.balance -= payment.amount
        vendor.virtual_balance += payment.amount
        
        new_tx = models.Transaction(
            wallet_id=wallet.id,
            vendor_id=vendor.id,
            amount=payment.amount,
            status="pending_settlement" # Günün sonu banka göndəriləcək
        )
        db.add(new_tx)
        db.commit()
    else:
        # Xəta olarsa redis-i geri qaytar
        r.incrbyfloat(redis_key, payment.amount)
        raise HTTPException(status_code=404, detail="Bazada qolbaq və ya obyekt tapılmadı")
    
    return {
        "status": "success",
        "message": "Ödəniş uğurla tamamlandı! (Bank üçün gözləmədədir)",
        "transaction_amount": payment.amount,
        "remaining_balance": round(new_balance, 2)
    }

@app.get("/database_view")
def get_database_view(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    result = []
    for u in users:
        wallet = db.query(models.Wallet).filter(models.Wallet.user_id == u.id).first()
        bank = db.query(models.BankAccount).filter(models.BankAccount.user_id == u.id).first()
        
        result.append({
            "user_id": u.id,
            "name": u.name,
            "nfc_uid": wallet.nfc_uid if wallet else "Yoxdur",
            "wallet_balance": wallet.balance if wallet else 0.0,
            "bank_account": bank.account_number if bank else "Yoxdur",
            "bank_balance": bank.balance if bank else 0.0
        })
    return result

@app.get("/profile/{nfc_uid}")
def get_profile(nfc_uid: str, db: Session = Depends(get_db)):
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Qolbaq tapılmadı")
    
    user = db.query(models.User).filter(models.User.id == wallet.user_id).first()
    bank = db.query(models.BankAccount).filter(models.BankAccount.user_id == wallet.user_id).first()
    
    return {
        "name": user.name,
        "nfc_uid": nfc_uid,
        "wallet_balance": wallet.balance,
        "bank_account": bank.account_number if bank else "Yoxdur",
        "bank_balance": bank.balance if bank else 0.0
    }

@app.get("/history/{nfc_uid}")
def get_history(nfc_uid: str, db: Session = Depends(get_db)):
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Qolbaq tapılmadı")
        
    transactions = db.query(models.Transaction).filter(models.Transaction.wallet_id == wallet.id).order_by(models.Transaction.timestamp.desc()).all()
    
    result = []
    for tx in transactions:
        vendor = db.query(models.Vendor).filter(models.Vendor.id == tx.vendor_id).first()
        result.append({
            "id": tx.id,
            "amount": tx.amount,
            "status": tx.status,
            "timestamp": tx.timestamp.isoformat(),
            "vendor_name": vendor.name if vendor else "Bilinmir"
        })
    return result

@app.post("/settle_day", response_model=schemas.SettlementResponse)
def settle_day(db: Session = Depends(get_db)):
    # Bütün pending_settlement tranzaksiyaları tapırıq
    pending_txs = db.query(models.Transaction).filter(models.Transaction.status == "pending_settlement").all()
    
    if not pending_txs:
        return {"status": "success", "message": "Gözləyən ödəniş yoxdur", "total_settled": 0.0}
        
    # Cüzdanlara görə qruplaşdırırıq ki, banka hər nəfər üçün tək sorğu getsin
    from collections import defaultdict
    user_totals = defaultdict(float)
    tx_by_wallet = defaultdict(list)
    
    for tx in pending_txs:
        user_totals[tx.wallet_id] += tx.amount
        tx_by_wallet[tx.wallet_id].append(tx)
        
    total_settled = 0.0
    
    for wallet_id, amount in user_totals.items():
        wallet = db.query(models.Wallet).filter(models.Wallet.id == wallet_id).first()
        if not wallet:
            continue
            
        # Bank API-nə toplu (batch) sorğu göndəririk
        try:
            response = httpx.post(
                "http://127.0.0.1:8000/bank/charge", 
                json={"nfc_uid": wallet.nfc_uid, "amount": amount},
                timeout=10.0
            )
            
            if response.status_code == 200 and response.json().get("bank_status") == "approved":
                # Uğurludursa, o cüzdanın bütün pending ödənişlərini completed edirik
                for tx in tx_by_wallet[wallet_id]:
                    tx.status = "completed"
                total_settled += amount
        except Exception as e:
            print(f"Bank xətası: {e}")
            pass # Bu cüzdan üçün alınmadı, digərlərinə keçirik
            
    db.commit()
    
    return {
        "status": "success", 
        "message": "Günün sonu hesablaşması bitdi!", 
        "total_settled": round(total_settled, 2)
    }
