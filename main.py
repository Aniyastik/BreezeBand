from fastapi import FastAPI, Depends, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import redis
import httpx
import asyncio
import os
import random
from datetime import datetime
from sqlalchemy.orm import Session

import models
import schemas
from database import engine, get_db

# Yeni Bank API Router-i və Celery fəhləsini import edirik
from bank_mock import router as bank_router
from worker import process_bank_settlement

from sqlalchemy import text

models.Base.metadata.create_all(bind=engine)

# Sadə migrasiya: is_admin və category sütunu yoxdursa əlavə et
try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;"))
        conn.execute(text("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS category VARCHAR DEFAULT 'General';"))
except Exception as e:
    print(f"Migrasiya xətası (göz ardı edilə bilər): {e}")
app = FastAPI(title="Sea Breeze Mini-Economy Engine")

async def run_daily_settlement():
    while True:
        await asyncio.sleep(120) # 2 dəqiqədə bir test üçün
        print(f"[{datetime.now()}] AVTOMATİK GÜNÜN SONU HESABLAŞMASI BAŞLADI...")
        db = next(get_db())
        try:
            await process_settlement(db)
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

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"Incoming request: {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response

# Static files (POS terminal)
app.mount("/static", StaticFiles(directory="static"), name="static")

# React frontend assets (JS, CSS)
frontend_dist = os.path.join(os.path.dirname(__file__), "frontend-react", "dist")
if os.path.exists(os.path.join(frontend_dist, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="frontend-assets")

redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
r = redis.from_url(redis_url, decode_responses=True)

def get_current_admin(x_admin_uid: str = Header(None), db: Session = Depends(get_db)):
    if not x_admin_uid:
        raise HTTPException(status_code=403, detail="Admin Header is missing")
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == x_admin_uid.lower().strip()).first()
    if not wallet:
        raise HTTPException(status_code=403, detail="Admin wallet not found")
    user = db.query(models.User).filter(models.User.id == wallet.user_id).first()
    if not user or not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden: Admin privileges required")
    return user


@app.get("/pos")
def pos_terminal():
    """Serve the POS terminal page for Android NFC payments."""
    return FileResponse("static/pos.html")


@app.get("/vendors")
def list_vendors(db: Session = Depends(get_db)):
    """List all vendors for the POS dropdown."""
    vendors = db.query(models.Vendor).all()
    return [{"id": v.id, "name": v.name, "category": v.category, "virtual_balance": v.virtual_balance} for v in vendors]


@app.get("/db-status")
def test_db_connection(db: Session = Depends(get_db)):
    vendors = db.query(models.Vendor).count()
    return {"status": "PostgreSQL işləyir", "vendors_count": vendors}


@app.post("/seed")
def seed_database(db: Session = Depends(get_db)):
    vendors_data = {
        "Restaurants": [
            "Shore House Restaurant and Lounge",
            "Park Cafe",
            "BOSIOR",
            "Wine Store and bar",
            "Polo Cafe",
            "Fish Box",
            "Scalini",
            "The Chayxana",
            "Shaurma No1"
        ],
        "Health and Fitness": [
            "Sport Beach Club",
            "Anti-aging Center",
            "Crocus Fitness"
        ],
        "Entertainment": [
            "Italian Circus",
            "Nine senses",
            "Funz karting",
            "Funzilla"
        ],
        "Stores": [
            "Wine store and bar",
            "Yana"
        ],
        "Beach tickets": []
    }
    
    # Add vendors
    for category, names in vendors_data.items():
        for name in names:
            existing_vendor = db.query(models.Vendor).filter(models.Vendor.name == name).first()
            if existing_vendor:
                if existing_vendor.category != category:
                    existing_vendor.category = category
            else:
                new_vendor = models.Vendor(name=name, category=category, virtual_balance=0.0)
                db.add(new_vendor)
    db.commit()

    # Baza əvvəllər toxumlanıbsa xəta verməməsi üçün sadə yoxlama
    existing_user = db.query(models.User).filter(models.User.name == "Aniya").first()
    if existing_user:
        if not existing_user.is_admin:
            existing_user.is_admin = True
            db.commit()
        return {"status": "Toxumlar artıq əkilib, yeni obyektlər əlavə edildi!", "balance": r.get('wallet:A1-B2-C3-D4:balance')}

    user = models.User(name="Aniya", is_admin=True)
    db.add(user)
    db.commit()
    
    nfc_uid = "A1-B2-C3-D4"
    wallet = models.Wallet(user_id=user.id, nfc_uid=nfc_uid, balance=200.0) # 200 AZN verək
    db.add(wallet)
    
    vendor = db.query(models.Vendor).filter(models.Vendor.name == "Shore House Restaurant and Lounge").first()
    
    r.set(f"wallet:{nfc_uid}:balance", 200.0)
    
    return {"status": "Toxumlar səpildi!", "test_nfc_uid": nfc_uid, "vendor_id": vendor.id if vendor else 1, "balance": 200.0}

@app.post("/register_nfc")
def register_nfc(data: schemas.RegistrationCreate, db: Session = Depends(get_db)):
    # NFC ID-ni lowercase edirik (case mismatch problemini həll edir)
    nfc_uid = data.nfc_uid.lower().strip()
    
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
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if wallet:
        if wallet.user_id != user.id:
            raise HTTPException(status_code=400, detail="Bu qolbaq başqa istifadəçiyə aiddir!")
        # Balansı artır
        wallet.balance += data.initial_balance
    else:
        wallet = models.Wallet(user_id=user.id, nfc_uid=nfc_uid, balance=data.initial_balance)
        db.add(wallet)
    
    db.commit()
    db.refresh(wallet)
    
    # Redis-i yenilə
    r.set(f"wallet:{nfc_uid}:balance", wallet.balance)
    
    return {"status": "success", "message": "Qolbaq qeydiyyata alındı!", "balance": wallet.balance}

@app.post("/topup_bank")
def topup_bank(data: schemas.TopUpRequest, db: Session = Depends(get_db)):
    nfc_uid = data.nfc_uid.lower().strip()
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wristband not found")
        
    bank_account = db.query(models.BankAccount).filter(models.BankAccount.user_id == wallet.user_id).first()
    if not bank_account:
        raise HTTPException(status_code=404, detail="Bank account not found")
        
    bank_account.balance += data.amount
    db.commit()
    db.refresh(bank_account)
    
    return {"status": "success", "message": f"{data.amount} AZN added to real bank account!", "new_bank_balance": bank_account.balance}

# ==============================================================================
# HƏDƏF NÖQTƏSİ: Toxundur və Keç (Sıfır Ləngimə Mühərriki)
# ==============================================================================
@app.post("/pay", response_model=schemas.TransactionResponse)
def process_payment(payment: schemas.TransactionCreate, db: Session = Depends(get_db)):
    # NFC ID-ni lowercase edirik
    nfc_uid = payment.nfc_uid.lower().strip()
    redis_key = f"wallet:{nfc_uid}:balance"
    
    current_balance = r.get(redis_key)
    
    # Redis-də yoxdursa, PostgreSQL-dən yoxla və Redis-ə cache et
    if current_balance is None:
        wallet_check = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
        if wallet_check is None:
            raise HTTPException(status_code=404, detail="Qolbaq tapılmadı və ya balans aktivləşdirilməyib")
        # Redis-ə cache edirik ki, növbəti dəfə sürətli olsun
        r.set(redis_key, wallet_check.balance)
        current_balance = wallet_check.balance
    
    current_balance = float(current_balance)
    if current_balance < payment.amount:
        raise HTTPException(status_code=400, detail="Mövcud vəsait çatmır")
        
    # Redis-dən dərhal çıxırıq (sürət üçün)
    new_balance = r.incrbyfloat(redis_key, -payment.amount)
    
    # Baza əməliyyatları
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
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
def get_database_view(admin: models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
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

@app.get("/api/users/by-nfc/{uid}")
def get_user_by_nfc(uid: str, admin: models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    uid = uid.lower().strip()
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Qolbaq tapılmadı")
    
    user = db.query(models.User).filter(models.User.id == wallet.user_id).first()
    bank = db.query(models.BankAccount).filter(models.BankAccount.user_id == wallet.user_id).first()
    
    return {
        "user_id": user.id,
        "name": user.name,
        "nfc_uid": uid,
        "wallet_balance": wallet.balance,
        "bank_account": bank.account_number if bank else "Yoxdur",
        "bank_balance": bank.balance if bank else 0.0,
        "is_admin": user.is_admin
    }

@app.get("/profile/{nfc_uid}")
def get_profile(nfc_uid: str, db: Session = Depends(get_db)):
    nfc_uid = nfc_uid.lower().strip()
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
        "bank_balance": bank.balance if bank else 0.0,
        "is_admin": user.is_admin
    }

@app.get("/history/{nfc_uid}")
def get_history(nfc_uid: str, db: Session = Depends(get_db)):
    nfc_uid = nfc_uid.lower().strip()
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

async def process_settlement(db: Session):
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
            port = os.environ.get("PORT", 8000)
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"http://127.0.0.1:{port}/bank/charge", 
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

@app.post("/settle_day", response_model=schemas.SettlementResponse)
async def settle_day(admin: models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return await process_settlement(db)


@app.get("/")
def read_root():
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"status": "Mühərrik işləyir", "redis_ping": r.ping()}

# React Router catch-all: bütün frontend səhifələri index.html-ə yönləndir
@app.get("/{path:path}")
def catch_all(path: str):
    # API və static yollarını atla
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Not found")
