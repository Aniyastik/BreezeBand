import hashlib
from fastapi import FastAPI, Depends, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
import redis
import httpx
import asyncio
import os
import random
import json
from datetime import datetime, date as _date, timezone
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

import models
import schemas
from database import engine, get_db

# Yeni Bank API Router-i və Celery fəhləsini import edirik
from bank_mock import router as bank_router
from worker import process_bank_settlement

from sqlalchemy import text

models.Base.metadata.create_all(bind=engine)

# Migrations: add columns / tables that may not exist yet
try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users   ADD COLUMN IF NOT EXISTS is_admin       BOOLEAN DEFAULT FALSE;"))
        conn.execute(text("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS category       VARCHAR DEFAULT 'General';"))
        conn.execute(text("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS age_restricted BOOLEAN DEFAULT FALSE;"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS family_accounts (
                id               SERIAL PRIMARY KEY,
                master_wallet_id INTEGER UNIQUE NOT NULL REFERENCES wallets(id),
                family_name      VARCHAR        NOT NULL,
                created_at       TIMESTAMP      DEFAULT NOW()
            );
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sub_accounts (
                id                   SERIAL PRIMARY KEY,
                family_id            INTEGER NOT NULL REFERENCES family_accounts(id),
                child_wallet_id      INTEGER UNIQUE NOT NULL REFERENCES wallets(id),
                child_name           VARCHAR NOT NULL,
                age                  INTEGER NOT NULL,
                daily_spending_limit FLOAT   NOT NULL DEFAULT 20.0,
                current_daily_spend  FLOAT   NOT NULL DEFAULT 0.0,
                spend_reset_date     DATE    NOT NULL DEFAULT CURRENT_DATE
            );
        """))
        # Pre-authorization / daily hold columns
        conn.execute(text("ALTER TABLE wallets ADD COLUMN IF NOT EXISTS daily_hold FLOAT DEFAULT 0.0;"))
        conn.execute(text("ALTER TABLE wallets ADD COLUMN IF NOT EXISTS hold_date  DATE;"))
        conn.execute(text("ALTER TABLE users   ADD COLUMN IF NOT EXISTS password_hash VARCHAR;"))
        conn.execute(text("ALTER TABLE wallets ADD COLUMN IF NOT EXISTS debt FLOAT DEFAULT 0.0;"))
except Exception as e:
    print(f"Migrasiya xətası (göz ardı edilə bilər): {e}")

# ── Password helpers ──────────────────────────────────────────────────────────
_PW_SALT = "seabreeze_nfc_salt_v1"

def _hash_pw(password: str) -> str:
    return hashlib.sha256(f"{_PW_SALT}:{password}".encode()).hexdigest()

def _verify_pw(password: str, stored_hash: str) -> bool:
    return _hash_pw(password) == stored_hash
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
    # Seed Aniya's wristband password if not yet set
    from database import SessionLocal
    db = SessionLocal()
    try:
        aniya_uid = "04:e1:f9:92:ca:2a:81"
        wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == aniya_uid).first()
        if wallet:
            user = db.query(models.User).filter(models.User.id == wallet.user_id).first()
            if user and not user.password_hash:
                user.password_hash = _hash_pw("aniya")
                db.commit()
                print("[startup] Aniya's wristband password set.")
    except Exception as e:
        print(f"[startup] Password seed error: {e}")
    finally:
        db.close()

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


# ── Family Wallets helpers ────────────────────────────────────────────────────

def _resolve_nfc(nfc_uid: str, db: Session):
    """
    Returns (wallet, sub_account_or_None, master_wallet_or_None).
    - Master  → (wallet, None, wallet)
    - Child   → (child_wallet, sub_acct, master_wallet)
    - Solo    → (wallet, None, None)
    - Missing → (None, None, None)
    """
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        return None, None, None

    family = db.query(models.FamilyAccount).filter(
        models.FamilyAccount.master_wallet_id == wallet.id
    ).first()
    if family:
        return wallet, None, wallet   # master account

    sub = db.query(models.SubAccount).filter(
        models.SubAccount.child_wallet_id == wallet.id
    ).first()
    if sub:
        master_wallet = db.query(models.Wallet).filter(
            models.Wallet.id == sub.family.master_wallet_id
        ).first()
        return wallet, sub, master_wallet

    return wallet, None, None         # solo (non-family) user


def _maybe_reset_daily_spend(sub: models.SubAccount, db: Session):
    """Lazy daily-spend reset — fires the first time a child pays after midnight."""
    today = _date.today()
    if sub.spend_reset_date != today:
        sub.current_daily_spend = 0.0
        sub.spend_reset_date    = today
        db.add(sub)


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
    nfc_uid = data.nfc_uid.lower().strip()

    MOCK_BANK_BALANCE = 5000.0  # Fixed mock balance for all prototype accounts

    # Check if user exists
    user = db.query(models.User).filter(models.User.name == data.user_name).first()
    if not user:
        user = models.User(name=data.user_name)
        # Set password if provided
        if data.password and data.password.strip():
            user.password_hash = _hash_pw(data.password.strip())
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create mock bank account with fixed balance
        bank_account = models.BankAccount(
            user_id=user.id,
            account_number=f"AZ{random.randint(1000,9999)}0000{random.randint(1000,9999)}",
            balance=MOCK_BANK_BALANCE
        )
        db.add(bank_account)
        db.commit()
    else:
        # User exists — update password if provided and not already set
        if data.password and data.password.strip() and not user.password_hash:
            user.password_hash = _hash_pw(data.password.strip())
            db.commit()

    # Check wristband
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if wallet:
        if wallet.user_id != user.id:
            raise HTTPException(status_code=400, detail="This wristband belongs to another user!")
    else:
        wallet = models.Wallet(user_id=user.id, nfc_uid=nfc_uid, balance=0.0)
        db.add(wallet)

    db.commit()
    db.refresh(wallet)

    # Update Redis
    r.set(f"wallet:{nfc_uid}:balance", wallet.balance)

    return {
        "status": "success",
        "message": "Wristband registered successfully!",
        "balance": wallet.balance,
        "has_password": bool(user.password_hash)
    }

@app.post("/topup_wallet")
def topup_wallet(data: schemas.TopUpRequest, db: Session = Depends(get_db)):
    nfc_uid = data.nfc_uid.lower().strip()
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wristband not found")
        
    bank_account = db.query(models.BankAccount).filter(models.BankAccount.user_id == wallet.user_id).first()
    if not bank_account:
        raise HTTPException(status_code=404, detail="Bank account not found")
        
    if bank_account.balance < data.amount:
        raise HTTPException(status_code=400, detail="Insufficient bank funds")
        
    bank_account.balance -= data.amount
    wallet.balance += data.amount
    db.commit()
    db.refresh(bank_account)
    db.refresh(wallet)
    
    r.set(f"wallet:{nfc_uid}:balance", wallet.balance)
    
    return {"status": "success", "message": f"{data.amount} AZN added to wristband from bank!", "new_wallet_balance": wallet.balance, "new_bank_balance": bank_account.balance}


# ==============================================================================
# DAILY BALANCE PRE-AUTHORIZATION (HOLD SYSTEM)
# ==============================================================================

def _get_hold_period_date() -> _date:
    """
    The hold period resets at 3:00 AM each day.
    Before 3 AM → still counts as the previous calendar day's period.
    At/after 3 AM → new period starts.
    """
    now = datetime.now()
    if now.hour < 3:
        from datetime import timedelta
        return (now - timedelta(days=1)).date()
    return now.date()


@app.post("/load_daily_balance", response_model=schemas.DailyLoadResponse)
def load_daily_balance(data: schemas.DailyLoadRequest, db: Session = Depends(get_db)):
    """
    Pre-authorizes a daily balance hold from the user's bank card.

    Rules:
    - Bank card must have >= requested amount.
    - ADDITIVE: calling multiple times in the same period adds to the hold.
    - The real bank card is NOT charged yet.
    - Period resets at 3:00 AM each day (so night owls after midnight still
      belong to the previous day's session).
    - At end of day (/settle_day), only what was actually spent is charged.
    - Unspent hold is released silently.
    """
    nfc_uid     = data.nfc_uid.lower().strip()
    period_date = _get_hold_period_date()

    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wristband not found.")

    bank_account = db.query(models.BankAccount).filter(
        models.BankAccount.user_id == wallet.user_id
    ).first()
    if not bank_account:
        raise HTTPException(status_code=404, detail="Bank account not found.")

    # If a new period has started (past 3 AM today), silently clear the old hold
    if wallet.hold_date != period_date:
        wallet.balance    = 0.0
        wallet.daily_hold = 0.0
        wallet.hold_date  = period_date

    # Bank card must have at least the requested amount
    if bank_account.balance < data.amount:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Bank card only has {bank_account.balance:.2f} AZN. "
                f"Cannot add {data.amount:.2f} AZN to hold."
            )
        )

    # ADDITIVE: add the new amount on top of whatever is already held
    wallet.balance    += data.amount
    wallet.daily_hold += data.amount
    wallet.hold_date   = period_date
    db.commit()
    db.refresh(wallet)

    r.set(f"wallet:{nfc_uid}:balance", wallet.balance)

    return {
        "status"           : "success",
        "message"          : (
            f"+{data.amount} AZN added to your daily balance "
            f"(total hold: {wallet.daily_hold:.2f} AZN). "
            "Your real bank balance is untouched."
        ),
        "wristband_balance": wallet.balance,
        "bank_balance"     : bank_account.balance,
        "daily_hold"       : wallet.daily_hold,
    }


# ==============================================================================
# HƏDƏF NÖQTƏSİ: Toxundur və Keç (Sıfır Ləngimə Mühərriki)
# ==============================================================================
AGE_MINIMUM = 18  # minimum age for age-restricted vendors (bars, etc.)

@app.post("/pay", response_model=schemas.FamilyTransactionResponse)
def process_payment(payment: schemas.TransactionCreate, db: Session = Depends(get_db)):
    """
    Family-aware payment endpoint.

    Decision tree:
    1. Resolve NFC → master / child / solo
    2. Child only:
       a. Age-gate  → 403 if vendor.age_restricted and child.age < 18
       b. Daily cap → 402 if amount exceeds remaining daily allowance
    3. Balance check on the MASTER (or solo) wallet via Redis
    4. Atomic Redis deduct + PostgreSQL write
    5. Update child's current_daily_spend if applicable
    """
    nfc_uid = payment.nfc_uid.lower().strip()

    # ── 1. Resolve identity ───────────────────────────────────────────────────
    wallet, sub, master_wallet = _resolve_nfc(nfc_uid, db)
    if wallet is None:
        raise HTTPException(status_code=404, detail="Wristband not found.")

    # ── DEBT GATE: block payment if user has outstanding debt ──────────────
    pay_wallet_for_debt = master_wallet if (sub is not None) else wallet
    if pay_wallet_for_debt.debt and pay_wallet_for_debt.debt > 0:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Wristband locked! Outstanding debt of {pay_wallet_for_debt.debt:.2f} AZN. "
                f"Please clear your debt from the dashboard to continue."
            )
        )

    is_child   = sub is not None
    if is_child and wallet.balance >= payment.amount:
        pay_wallet = wallet
    else:
        pay_wallet = master_wallet if is_child else wallet

    # ── Fetch vendor (needed for both paths) ─────────────────────────────────
    vendor = db.query(models.Vendor).filter(models.Vendor.id == payment.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found.")

    # ── 2a. Age gate (child only) ─────────────────────────────────────────────
    if is_child and vendor.age_restricted and sub.age < AGE_MINIMUM:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Age restriction: this terminal requires {AGE_MINIMUM}+. "
                f"'{sub.child_name}' is {sub.age} years old."
            )
        )

    # ── 2b. Daily spending limit (child only) ─────────────────────────────────
    if is_child:
        _maybe_reset_daily_spend(sub, db)
        remaining_today = sub.daily_spending_limit - sub.current_daily_spend
        if payment.amount > remaining_today:
            raise HTTPException(
                status_code=402,
                detail=(
                    f"Daily limit reached. '{sub.child_name}' has "
                    f"{remaining_today:.2f} AZN remaining today "
                    f"(limit: {sub.daily_spending_limit:.2f} AZN/day)."
                )
            )

    # ── 3. Balance check on master/solo wallet (Redis fast-path) ─────────────
    redis_key     = f"wallet:{pay_wallet.nfc_uid}:balance"
    cached_bal    = r.get(redis_key)
    if cached_bal is None:
        r.set(redis_key, pay_wallet.balance)
        cached_bal = pay_wallet.balance
    current_balance = float(cached_bal)

    if current_balance < payment.amount:
        # Fallback sync: if Redis is stale (e.g., due to manual DB edits), check PG directly
        db.refresh(pay_wallet)
        if pay_wallet.balance >= payment.amount:
            r.set(redis_key, pay_wallet.balance)
            current_balance = pay_wallet.balance

    if current_balance < payment.amount:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient funds. "
                f"Balance: {current_balance:.2f} AZN, "
                f"Requested: {payment.amount:.2f} AZN."
            )
        )

    # ── 4. Atomic Redis deduction ─────────────────────────────────────────────
    new_balance = r.incrbyfloat(redis_key, -payment.amount)

    # ── 5. PostgreSQL write ───────────────────────────────────────────────────
    try:
        pay_wallet.balance     -= payment.amount
        vendor.virtual_balance += payment.amount

        if is_child:
            sub.current_daily_spend += payment.amount

        new_tx = models.Transaction(
            wallet_id = wallet.id,          # tapped wristband (audit trail)
            vendor_id = vendor.id,
            amount    = payment.amount,
            status    = "pending_settlement"
        )
        db.add(new_tx)
        db.commit()
    except Exception as exc:
        r.incrbyfloat(redis_key, payment.amount)  # rollback Redis
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB write failed: {exc}")

    account_type = "child" if is_child else ("master" if master_wallet == wallet else "solo")

    return {
        "status"             : "success",
        "message"            : (
            f"Payment approved for {sub.child_name}." if is_child
            else "Payment approved."
        ),
        "account_type"       : account_type,
        "transaction_amount" : payment.amount,
        "remaining_balance"  : round(new_balance, 2),
        "child_daily_spend"  : round(sub.current_daily_spend, 2) if is_child else None,
        "child_daily_limit"  : sub.daily_spending_limit if is_child else None,
    }


# ── Family registration endpoints ─────────────────────────────────────────────

@app.post("/family/create")
def create_family_account(data: schemas.FamilyAccountCreate, db: Session = Depends(get_db)):
    """Register a parent wristband as the master of a new family account."""
    nfc_uid = data.master_nfc_uid.lower().strip()
    wallet  = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Master wristband not registered.")

    existing = db.query(models.FamilyAccount).filter(
        models.FamilyAccount.master_wallet_id == wallet.id
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Family account already exists for this wristband.")

    family = models.FamilyAccount(
        master_wallet_id = wallet.id,
        family_name      = data.family_name
    )
    db.add(family)
    db.commit()
    db.refresh(family)
    return {"status": "success", "family_id": family.id, "family_name": family.family_name}


@app.post("/family/add_child")
def add_child_to_family(data: schemas.SubAccountCreate, db: Session = Depends(get_db)):
    """Link a child wristband (already registered via /register_nfc) to a family account."""
    master_uid = data.master_nfc_uid.lower().strip()
    child_uid  = data.child_nfc_uid.lower().strip()

    master_wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == master_uid).first()
    if not master_wallet:
        raise HTTPException(status_code=404, detail="Master wristband not found.")

    family = db.query(models.FamilyAccount).filter(
        models.FamilyAccount.master_wallet_id == master_wallet.id
    ).first()
    if not family:
        raise HTTPException(
            status_code=404,
            detail="Family account not found. Create one first via POST /family/create."
        )

    child_wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == child_uid).first()
    if not child_wallet:
        raise HTTPException(
            status_code=404,
            detail="Child wristband not registered. Use POST /register_nfc first."
        )

    already = db.query(models.SubAccount).filter(
        models.SubAccount.child_wallet_id == child_wallet.id
    ).first()
    if already:
        raise HTTPException(status_code=409, detail="This wristband is already linked to a family account.")

    sub = models.SubAccount(
        family_id            = family.id,
        child_wallet_id      = child_wallet.id,
        child_name           = data.child_name,
        age                  = data.age,
        daily_spending_limit = data.daily_spending_limit,
        current_daily_spend  = 0.0,
        spend_reset_date     = _date.today()
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)

    return {
        "status"              : "success",
        "child_name"          : sub.child_name,
        "age"                 : sub.age,
        "daily_spending_limit": sub.daily_spending_limit,
        "family_name"         : family.family_name,
        "master_nfc_uid"      : master_uid
    }


# ── Tracking / BLE ────────────────────────────────────────────────────────────

@app.post("/api/location/ping")
def receive_location_ping(data: schemas.LocationPing):
    loc_data = {
        "gateway_id": data.gateway_id,
        "rssi": data.rssi,
        "last_seen": datetime.now(timezone.utc).isoformat()
    }
    r.hset("ble_locations", data.band_id.lower().strip(), json.dumps(loc_data))
    return {"status": "success"}

@app.get("/simulator")
def get_hardware_simulator():
    """Serves the manual BLE hardware simulator directly."""
    return FileResponse("hardware_simulator/manual_controller.html")


# ── AI Concierge ──────────────────────────────────────────────────────────────

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None

class RealLLM:
    """Connects to OpenAI to generate dynamic, luxury concierge responses."""
    
    @staticmethod
    async def generate_response(user_message: str, context: dict) -> str:
        if not AsyncOpenAI:
            return "Error: OpenAI library is not installed."
            
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return "Error: OPENAI_API_KEY is not set."
            
        api_key = api_key.strip()
        client = AsyncOpenAI(api_key=api_key)
        
        user_age = context.get("age", 18)
        current_balance = context.get("balance", 0.0)
        bank_balance = context.get("bank_balance", 0.0)
        current_location = context.get("location", "Unknown")
        vendors = context.get("vendors", [])
        
        total_funds = current_balance + bank_balance
        resort_database_json = json.dumps(vendors, indent=2)

        system_prompt = f"""
You are **Breeze**, the elite digital concierge for the world-class Sea Breeze Resort. Your tone is warm, luxurious, highly professional, and slightly ocean-themed. You provide 5-star service to every guest, ensuring their stay is seamless, memorable, and extraordinary.

### REAL-TIME GUEST CONTEXT
- **Age**: {user_age}
- **Current Wristband Balance**: {current_balance:.2f} AZN
- **Current Bank Balance**: {bank_balance:.2f} AZN
- **Total Available Funds**: {total_funds:.2f} AZN
- **Current Location**: {current_location}

### RESORT DATABASE
{resort_database_json}

### STRICT CONSTRAINTS (RBAC)
1. **Age Restriction (CRITICAL)**: NEVER recommend alcohol, bars, or any 18+/21+ venues to guests if their Age is under 18. If a minor requests restricted access, politely decline and immediately offer a highly appealing, age-appropriate alternative.
2. **Financial Awareness**: NEVER recommend a venue or service if the guest's Total Available Funds cannot comfortably cover it. If they request an experience that exceeds their funds, graciously suggest a fantastic, budget-appropriate alternative without making them feel uncomfortable.
3. **Accuracy**: Only recommend venues, restaurants, and activities that exist in the provided Resort Database. Do not invent locations.

### BEHAVIORAL & FORMATTING RULES
1. **Context Mastery**: Always weave the user's current context (Location, Balance, or Age) gracefully into your response. For example: "Since you are enjoying the sunshine by the Pool right now..." or "With your generous balance, you might enjoy..."
2. **Rich Detail**: When recommending a location, do not just list the name. Describe the ambiance, signature items, or the luxury experience to build excitement.
3. **Proactive Engagement**: ALWAYS end your response with a proactive follow-up question to keep the conversation going and anticipate their next need (e.g., "Shall I guide you to the quickest walking route?", "Would you like to hear about our sunset specials?").
4. **Formatting**: 
   - Use Markdown formatting.
   - Use **bold text** for venue and service names.
   - Use bullet points for listing multiple options.
   - Include a few tasteful emojis (e.g., 🌊, 🍹, 🌴, ✨) to make the interface visually stunning and inviting.
"""

        try:
            response = await client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.7,
                max_tokens=400
            )
            return response.choices[0].message.content
        except Exception as e:
            import traceback
            error_details = f"{repr(e)} | Trace: {traceback.format_exc()}"
            return f"I'm sorry, I encountered an issue connecting to the concierge network: {error_details}"

class MockLLM:
    """Simulates an OpenAI LLM Call with Semantic Routing and Context Injection."""
    @staticmethod
    def generate_response(system_prompt: str, user_message: str, context: dict) -> str:
        msg = user_message.lower()
        age = context.get("age", 18)
        balance = context.get("balance", 0)
        bank_balance = context.get("bank_balance", 0)
        location = context.get("location", "Unknown")

        total_funds = balance + bank_balance

        # Semantic Route: Greetings
        if msg in ["hi", "hello", "hey", "good morning", "good evening", "good afternoon", "start"]:
            return f"Hello! I am your BreezeBand AI Concierge. I see your current wristband balance is {balance:.2f} AZN (with {bank_balance:.2f} AZN in your bank). How can I help you enjoy your stay at Sea Breeze today?"

        # Semantic Route: Drink/Thirsty/Alcohol
        if "drink" in msg or "thirsty" in msg or "wine" in msg or "beer" in msg or "alcohol" in msg or "cocktail" in msg:
            if age < 18:
                return "Since you're under 18, I can't recommend the Wine Store. However, you can grab a delicious, freshly squeezed juice or a tropical smoothie at the Park Cafe or The Chayxana!"
            else:
                return "You're of age! I highly recommend the 'Wine store and bar' for a premium selection of fine wines and signature cocktails. It's the perfect place to relax and enjoy the evening."
        
        # Semantic Route: Sweet/Dessert
        if "sweet" in msg or "swwet" in msg or "dessert" in msg or "cake" in msg or "ice cream" in msg or "sugar" in msg:
            return "Craving something sweet? You can find exquisite, handcrafted desserts and pastries at Park Cafe or Polo Cafe! If you want a quick sweet snack on the go, Shaurma No1 might also have some delightful options."

        # Semantic Route: Coffee/Tea
        if "coffee" in msg or "tea" in msg or "latte" in msg or "espresso" in msg or "cafe" in msg or "caffeine" in msg:
            return "Need a caffeine boost? Park Cafe and Polo Cafe serve excellent, barista-crafted coffee using premium roasted beans. For a more traditional experience, definitely visit The Chayxana for authentic Azerbaijani tea and sweets!"

        # Semantic Route: Specific Venues
        if "scalini" in msg or "shore house" in msg or "shaurma" in msg or "bosior" in msg:
            if "shaurma" in msg:
                return "Shaurma No1 is a fantastic, budget-friendly option for a quick, incredibly tasty bite, perfect for when you're on the move!"
            if total_funds < 20:
                return f"That's a fantastic choice, but considering your total available funds ({total_funds:.2f} AZN), it might be a bit pricey. Shaurma No1 or Park Cafe could be more comfortable for your budget while still being delicious!"
            if balance < 20 and bank_balance >= 20:
                return f"Excellent choice! That venue offers a fantastic and premium dining experience. I notice your wristband balance is low ({balance:.2f} AZN), but you have plenty in your bank ({bank_balance:.2f} AZN). Don't forget to load your daily balance from the dashboard before you go!"
            return "Excellent choice! That venue offers a fantastic, world-class dining experience with premium service and an unforgettable atmosphere."

        # Semantic Route: Eat/Hungry
        if "eat" in msg or "hungry" in msg or "food" in msg or "restaurant" in msg or "dinner" in msg or "lunch" in msg or "breakfast" in msg or "snack" in msg:
            if total_funds < 20:
                return f"I see your wristband balance is {balance:.2f} AZN. Scalini or Shore House might be a bit pricey right now, but you can definitely grab a delicious, satisfying quick bite at Shaurma No1 or Fish Box!"
            elif balance < 20 and bank_balance >= 20:
                return f"You have plenty of funds in your bank ({bank_balance:.2f} AZN), but your wristband balance is currently {balance:.2f} AZN. I highly recommend dining at Shore House Restaurant and Lounge or enjoying premium Italian at Scalini! Just remember to load your daily balance from the dashboard first."
            else:
                return "You have plenty in your balance! For an exquisite culinary experience, I highly recommend dining at Shore House Restaurant and Lounge, BOSIOR, or enjoying authentic, premium Italian cuisine at Scalini."
                
        # Semantic Route: Relax/Spa/Massage
        if "relax" in msg or "spa" in msg or "massage" in msg or "zen" in msg or "yoga" in msg or "wellness" in msg:
            return "Looking to unwind and rejuvenate? I highly recommend booking a luxurious session at the Anti-aging Center for some world-class pampering, or visiting Nine Senses for a serene yoga and wellness experience."

        # Semantic Route: Gym/Workout/Sport
        if "gym" in msg or "workout" in msg or "sport" in msg or "exercise" in msg or "fitness" in msg or "train" in msg:
            return "Want to break a sweat? Crocus Fitness is our state-of-the-art gym facility featuring premium equipment and personal trainers. Don't forget your BreezeBand to seamlessly access the lockers and facilities!"

        # Semantic Route: Beach/Swim/Pool
        if "beach" in msg or "swim" in msg or "pool" in msg or "sun" in msg or "water" in msg or "sea" in msg:
            return "It's a beautiful day for the water! You can relax and soak up the sun at the luxurious Hovuz Bari (Pool Bar) or head down to the Sport Beach Club to enjoy the pristine sea breeze and refreshing waves."

        # Semantic Route: Kids/Family
        if "kid" in msg or "child" in msg or "family" in msg or "circus" in msg or "children" in msg:
            return "Sea Breeze is a paradise for families! The kids will absolutely be mesmerized by the spectacular Italian Circus, or they can spend hours having the time of their lives at Funzilla."

        # Semantic Route: Fun/Activity
        if "fun" in msg or "activity" in msg or "bored" in msg or "play" in msg or "game" in msg or "karting" in msg:
            return "Looking for an adrenaline rush or some great entertainment? Check out the incredible Funzilla or race your friends at the thrilling Funz karting track! They are extremely popular and guarantee an unforgettable time."
            
        # Semantic Route: Location/Near me
        if "where" in msg or "near" in msg or "around" in msg or "lost" in msg or "location" in msg:
            if location != "Unknown":
                loc_name = location.replace("_gateway", "").replace("_", " ").title()
                return f"I can see from your advanced BreezeBand signal that you are currently near the {loc_name}. Feel free to check out the amazing venues right around you, or easily hop on a resort buggy to explore the rest of our beautiful property!"
            return "I'm currently unable to pinpoint your exact location (no active signal detected), but the vibrant Pool area or our grand Lobby are always excellent starting points for your adventure!"

        # Semantic Route: Balance/Money
        if "balance" in msg or "money" in msg or "cost" in msg or "price" in msg or "pay" in msg or "azn" in msg:
            if bank_balance > 0 and balance == 0:
                return f"Your current wristband balance is {balance:.2f} AZN, but you have {bank_balance:.2f} AZN in your linked bank account. You can easily load funds to your wristband via the dashboard to pay effortlessly at any POS terminal!"
            return f"Your current available wristband balance is {balance:.2f} AZN (with {bank_balance:.2f} AZN in your bank). Remember, you can simply tap your BreezeBand at any POS terminal across the resort to pay instantly and effortlessly!"

        # Semantic Route: Emergency/Help
        if "help" in msg or "emergency" in msg or "doctor" in msg or "police" in msg or "guard" in msg:
            return "Your safety is our absolute priority. If you have a medical or security emergency, please proceed immediately to the main Lobby or approach any Sea Breeze Security Staff member. We have a dedicated team available 24/7 to assist you."

        # Default fallback
        return f"I'm sorry, as your AI Concierge, I didn't quite catch that. I see your wristband has {balance:.2f} AZN. Would you like me to recommend a spectacular restaurant, an exciting activity, or help you navigate our beautiful resort?"


@app.post("/api/ai/chat")
async def ai_chat(req: schemas.ChatRequest, db: Session = Depends(get_db)):
    """
    Context-Aware AI Concierge Endpoint.
    Demonstrates Age-stratified Context Injection & Semantic Routing.
    """
    nfc_uid = req.nfc_uid.lower().strip()
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wristband not found.")
        
    sub = db.query(models.SubAccount).filter(models.SubAccount.child_wallet_id == wallet.id).first()
    
    # 1. Context: Age
    age = sub.age if sub else 25 # Default adult age if master/solo
    
    # 2. Context: Balance
    is_child = sub is not None
    bank_balance = 0.0
    if is_child:
        master_wallet = db.query(models.Wallet).filter(models.Wallet.id == sub.family.master_wallet_id).first()
        if wallet.balance > 0:
            available_balance = wallet.balance
        else:
            available_balance = min(master_wallet.balance, sub.daily_spending_limit - sub.current_daily_spend) if master_wallet else 0.0
            
        if master_wallet:
            bank = db.query(models.BankAccount).filter(models.BankAccount.user_id == master_wallet.user_id).first()
            if bank:
                bank_balance = bank.balance
    else:
        available_balance = wallet.balance
        bank = db.query(models.BankAccount).filter(models.BankAccount.user_id == wallet.user_id).first()
        if bank:
            bank_balance = bank.balance
        
    # 3. Context: Location
    loc_str = r.hget("ble_locations", nfc_uid)
    loc_data = json.loads(loc_str) if loc_str else None
    location = loc_data.get("gateway_id", "Unknown") if loc_data else "Unknown"
    
    # 4. Context: Vendors Database
    vendors = db.query(models.Vendor).all()
    vendor_list = [{"name": v.name, "age_restricted": v.age_restricted} for v in vendors]
    
    context = {
        "age": age,
        "balance": available_balance,
        "bank_balance": bank_balance,
        "location": location,
        "vendors": vendor_list
    }
    
    # Construct System Prompt (Simulated Injection)
    system_prompt = f"""
    You are the BreezeBand AI Concierge for Sea Breeze Resort.
    USER CONTEXT:
    - Age: {age}
    - Available Balance: {available_balance} AZN
    - Current Location: {location}
    
    RULES:
    1. Do not recommend age_restricted venues to users under 18.
    2. Suggest cheaper options if balance is low.
    """
    
    # Route to LLM
    if os.environ.get("OPENAI_API_KEY"):
        response_text = await RealLLM.generate_response(req.message, context)
    else:
        response_text = MockLLM.generate_response(system_prompt, req.message, context)
    
    return {"reply": response_text, "context_injected": context}


@app.get("/family/info/{master_nfc_uid}")
def get_family_info(master_nfc_uid: str, db: Session = Depends(get_db)):
    """Return the full family account with all children and their spend status."""
    nfc_uid = master_nfc_uid.lower().strip()
    wallet  = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wristband not found.")

    family = db.query(models.FamilyAccount).filter(
        models.FamilyAccount.master_wallet_id == wallet.id
    ).first()

    is_master = True
    if not family:
        sub = db.query(models.SubAccount).filter(models.SubAccount.child_wallet_id == wallet.id).first()
        if sub:
            family = sub.family
            is_master = False

    if not family:
        raise HTTPException(status_code=404, detail="No family account for this wristband.")

    children = []
    for sub in family.sub_accounts:
        cw = db.query(models.Wallet).filter(models.Wallet.id == sub.child_wallet_id).first()
        
        child_user_name = sub.child_name
        if cw:
            child_user = db.query(models.User).filter(models.User.id == cw.user_id).first()
            if child_user:
                child_user_name = child_user.name
                
        child_nfc = cw.nfc_uid if cw else "?"
        
        loc_str = r.hget("ble_locations", child_nfc.lower()) if cw else None
        location_data = json.loads(loc_str) if loc_str else None

        children.append({
            "child_name"          : child_user_name,
            "age"                 : sub.age,
            "nfc_uid"             : child_nfc,
            "daily_spending_limit": sub.daily_spending_limit,
            "current_daily_spend" : sub.current_daily_spend,
            "remaining_today"     : round(sub.daily_spending_limit - sub.current_daily_spend, 2),
            "spend_reset_date"    : str(sub.spend_reset_date),
            "location"            : location_data
        })

    master_wallet = db.query(models.Wallet).filter(models.Wallet.id == family.master_wallet_id).first()
    master_loc_str = r.hget("ble_locations", master_wallet.nfc_uid.lower()) if master_wallet else None
    master_location = json.loads(master_loc_str) if master_loc_str else None

    return {
        "family_name"     : family.family_name,
        "master_nfc_uid"  : master_wallet.nfc_uid if master_wallet else None,
        "master_balance"  : master_wallet.balance if master_wallet else 0.0,
        "master_location" : master_location,
        "children"        : children,
        "is_master"       : is_master
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
    
    family_member_type = None
    family_name = None

    family = db.query(models.FamilyAccount).filter(models.FamilyAccount.master_wallet_id == wallet.id).first()
    if family:
        family_member_type = "master"
        family_name = family.family_name
    else:
        sub = db.query(models.SubAccount).filter(models.SubAccount.child_wallet_id == wallet.id).first()
        if sub:
            family_member_type = "child"
            if sub.family:
                family_name = sub.family.family_name

    loc_str = r.hget("ble_locations", nfc_uid.lower())
    location_data = json.loads(loc_str) if loc_str else None

    return {
        "name": user.name,
        "nfc_uid": nfc_uid,
        "wallet_balance": wallet.balance,
        "bank_account": bank.account_number if bank else "Yoxdur",
        "bank_balance": bank.balance if bank else 0.0,
        "is_admin": user.is_admin,
        "has_password": bool(user.password_hash),
        "debt": wallet.debt or 0.0,
        "family_member_type": family_member_type,
        "family_name": family_name,
        "location": location_data
    }

@app.patch("/profile/{nfc_uid}")
def update_profile(nfc_uid: str, data: schemas.UpdateProfileRequest, db: Session = Depends(get_db)):
    """Update the user's display name and/or bank account number."""
    nfc_uid = nfc_uid.lower().strip()
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wristband not found.")

    user = db.query(models.User).filter(models.User.id == wallet.user_id).first()
    bank = db.query(models.BankAccount).filter(models.BankAccount.user_id == wallet.user_id).first()

    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty.")
        user.name = name

    if data.bank_account is not None:
        acct = data.bank_account.strip()
        if not acct:
            raise HTTPException(status_code=400, detail="Bank account cannot be empty.")
        if bank:
            bank.account_number = acct
        else:
            # Create a bank account if the user doesn't have one yet
            bank = models.BankAccount(user_id=user.id, account_number=acct, balance=0.0)
            db.add(bank)

    db.commit()
    db.refresh(user)

    return {
        "status": "success",
        "name": user.name,
        "bank_account": bank.account_number if bank else "Yoxdur",
    }

# ==============================================================================
# WRISTBAND PASSWORD / PIN SYSTEM
# ==============================================================================

@app.get("/check/{nfc_uid}", response_model=schemas.CheckUidResponse)
def check_uid(nfc_uid: str, db: Session = Depends(get_db)):
    """
    Lightweight pre-check — returns name and whether a password is required.
    Called before showing the password prompt on the frontend.
    """
    nfc_uid = nfc_uid.lower().strip()
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wristband not found.")
    user = db.query(models.User).filter(models.User.id == wallet.user_id).first()
    return {"name": user.name, "has_password": bool(user.password_hash)}


@app.post("/profile/unlock")
def unlock_profile(data: schemas.UnlockRequest, db: Session = Depends(get_db)):
    """
    Authenticates the wristband and returns the full profile.
    If the account has no password, no password is needed.
    If the account has a password, it must be supplied and correct.
    """
    nfc_uid = data.nfc_uid.lower().strip()
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wristband not found.")

    user = db.query(models.User).filter(models.User.id == wallet.user_id).first()
    bank = db.query(models.BankAccount).filter(models.BankAccount.user_id == wallet.user_id).first()

    # Password check
    if user.password_hash:
        if not data.password:
            raise HTTPException(status_code=401, detail="This wristband is password-protected. Please enter your password.")
        if not _verify_pw(data.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")

    family_member_type = None
    family_name = None

    family_acc = db.query(models.FamilyAccount).filter(models.FamilyAccount.master_wallet_id == wallet.id).first()
    if family_acc:
        family_member_type = "master"
        family_name = family_acc.family_name
    else:
        sub = db.query(models.SubAccount).filter(models.SubAccount.child_wallet_id == wallet.id).first()
        if sub:
            family_member_type = "child"
            if sub.family:
                family_name = sub.family.family_name

    return {
        "name"            : user.name,
        "nfc_uid"         : nfc_uid,
        "wallet_balance"  : wallet.balance,
        "bank_account"    : bank.account_number if bank else "Yoxdur",
        "bank_balance"    : bank.balance if bank else 0.0,
        "is_admin"        : user.is_admin,
        "has_password"    : bool(user.password_hash),
        "debt"            : wallet.debt or 0.0,
        "family_member_type": family_member_type,
        "family_name"     : family_name
    }


@app.patch("/set_password/{nfc_uid}")
def set_password(nfc_uid: str, data: schemas.SetPasswordRequest, db: Session = Depends(get_db)):
    """
    Set or change the wristband password.
    - If no password yet: just supply new_password.
    - If password exists: must supply current_password to verify before changing.
    - To REMOVE a password: set new_password to "" (empty string).
    """
    nfc_uid = nfc_uid.lower().strip()
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wristband not found.")

    user = db.query(models.User).filter(models.User.id == wallet.user_id).first()

    # If already has a password, require current password
    if user.password_hash:
        if not data.current_password or not _verify_pw(data.current_password, user.password_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")

    # Set or clear
    if data.new_password.strip():
        user.password_hash = _hash_pw(data.new_password.strip())
        msg = "Password set successfully."
    else:
        user.password_hash = None
        msg = "Password removed. Wristband is now unprotected."

    db.commit()
    return {"status": "success", "message": msg}

# ==============================================================================
# DEBT PAYMENT
# ==============================================================================

@app.post("/pay_debt/{nfc_uid}")
async def pay_debt(nfc_uid: str, db: Session = Depends(get_db)):
    """
    Attempt to charge the user's bank account for outstanding debt.
    On success, clears the debt and unlocks the wristband.
    """
    nfc_uid = nfc_uid.lower().strip()
    wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wristband not found.")

    debt = wallet.debt or 0.0
    if debt <= 0:
        return {"status": "success", "message": "No outstanding debt.", "debt": 0.0}

    bank = db.query(models.BankAccount).filter(
        models.BankAccount.user_id == wallet.user_id
    ).first()
    if not bank:
        raise HTTPException(status_code=404, detail="No bank account linked.")

    if bank.balance < debt:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Insufficient bank balance. "
                f"Debt: {debt:.2f} AZN, Bank balance: {bank.balance:.2f} AZN. "
                f"Please top up your bank account first."
            )
        )

    # Charge the bank
    port = os.environ.get("PORT", 8000)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"http://127.0.0.1:{port}/bank/charge",
                json={"nfc_uid": nfc_uid, "amount": debt},
                timeout=10.0
            )
        resp_data = response.json()
        if response.status_code == 200 and resp_data.get("bank_status") == "approved":
            wallet.debt = 0.0
            db.commit()
            return {
                "status": "success",
                "message": f"Debt of {debt:.2f} AZN paid! Your wristband is unlocked.",
                "debt": 0.0,
                "new_bank_balance": resp_data.get("new_bank_balance", bank.balance - debt)
            }
        else:
            raise HTTPException(status_code=400, detail="Bank declined the charge. Please try again later.")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Bank connection error: {e}")


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
    """
    End-of-day settlement with DEBT support.
    - Finds every wallet with an active daily hold.
    - Charges ONLY the amount actually spent to the real bank card.
    - If the bank can't cover the full spend, charges what it can
      and creates DEBT for the remainder (wristband locked until paid).
    - If nothing was spent, the hold is released silently (bank untouched).
    - Resets wristband balance, daily_hold, and hold_date for all wallets.
    """
    from collections import defaultdict

    held_wallets = db.query(models.Wallet).filter(models.Wallet.daily_hold > 0).all()
    pending_txs  = db.query(models.Transaction).filter(
        models.Transaction.status == "pending_settlement"
    ).all()

    if not pending_txs and not held_wallets:
        return {"status": "success", "message": "No pending settlements.", "total_settled": 0.0}

    spent_by_wallet: defaultdict[int, float] = defaultdict(float)
    tx_by_wallet:    defaultdict[int, list]  = defaultdict(list)
    for tx in pending_txs:
        spent_by_wallet[tx.wallet_id] += tx.amount
        tx_by_wallet[tx.wallet_id].append(tx)

    port           = os.environ.get("PORT", 8000)
    total_settled  = 0.0
    total_debt     = 0.0
    all_wallet_ids = {w.id for w in held_wallets} | set(spent_by_wallet.keys())

    for wallet_id in all_wallet_ids:
        wallet = db.query(models.Wallet).filter(models.Wallet.id == wallet_id).first()
        if not wallet:
            continue

        actually_spent = spent_by_wallet.get(wallet_id, 0.0)

        if actually_spent > 0:
            # Check how much the bank can actually cover
            bank = db.query(models.BankAccount).filter(
                models.BankAccount.user_id == wallet.user_id
            ).first()
            bank_available = bank.balance if bank else 0.0

            if bank_available >= actually_spent:
                # Bank can cover everything — full charge
                charge_amount = actually_spent
                debt_amount   = 0.0
            else:
                # Bank can only partially cover — charge what we can, rest is debt
                charge_amount = bank_available
                debt_amount   = round(actually_spent - bank_available, 2)

            # Charge the bank for whatever it can cover
            if charge_amount > 0:
                try:
                    async with httpx.AsyncClient() as client:
                        response = await client.post(
                            f"http://127.0.0.1:{port}/bank/charge",
                            json={"nfc_uid": wallet.nfc_uid, "amount": charge_amount},
                            timeout=10.0
                        )
                    if response.status_code == 200 and response.json().get("bank_status") == "approved":
                        total_settled += charge_amount
                        print(
                            f"[SETTLEMENT] {wallet.nfc_uid}: charged {charge_amount:.2f} AZN "
                            f"(spent {actually_spent:.2f}, held {wallet.daily_hold:.2f})"
                        )
                    else:
                        # Bank declined even the partial amount — entire spend becomes debt
                        debt_amount = actually_spent
                        print(f"[SETTLEMENT] Bank declined for {wallet.nfc_uid}, full amount becomes debt")
                except Exception as e:
                    debt_amount = actually_spent
                    print(f"[SETTLEMENT] Bank error for {wallet.nfc_uid}: {e}, full amount becomes debt")

            # Apply debt if any
            if debt_amount > 0:
                wallet.debt = round((wallet.debt or 0.0) + debt_amount, 2)
                total_debt += debt_amount
                print(
                    f"[SETTLEMENT] {wallet.nfc_uid}: DEBT created — {debt_amount:.2f} AZN "
                    f"(total debt: {wallet.debt:.2f})"
                )

            # Mark transactions as completed regardless (the spend happened)
            for tx in tx_by_wallet[wallet_id]:
                tx.status = "completed" if debt_amount == 0 else "settled_with_debt"
        else:
            print(
                f"[SETTLEMENT] {wallet.nfc_uid}: nothing spent, "
                f"{wallet.daily_hold:.2f} AZN hold released. Bank untouched."
            )

        # Always reset the wristband at end of day
        wallet.balance    = 0.0
        wallet.daily_hold = 0.0
        wallet.hold_date  = None
        r.set(f"wallet:{wallet.nfc_uid}:balance", 0.0)

    db.commit()

    return {
        "status"       : "success",
        "message"      : f"Settlement complete. Settled: {total_settled:.2f} AZN, New debt: {total_debt:.2f} AZN.",
        "total_settled": round(total_settled, 2),
        "total_debt"   : round(total_debt, 2)
    }

@app.post("/settle_day", response_model=schemas.SettlementResponse)
async def settle_day(admin: models.User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return await process_settlement(db)



@app.get("/")
def read_root(request: Request):
    # If this is the POS deployment (detected by hostname), go straight to /pos
    host = request.headers.get("host", "")
    if "powerful-success" in host:
        return RedirectResponse(url="/pos")
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"status": "Mühərrik işləyir", "redis_ping": r.ping()}

# React Router catch-all: bütün frontend səhifələri index.html-ə yönləndir
@app.get("/{path:path}")
def catch_all(request: Request, path: str):
    host = request.headers.get("host", "")
    # If this is the POS deployment, redirect non-API paths to /pos
    if "powerful-success" in host:
        api_paths = ["pos", "pay", "vendors", "profile", "history", "register_nfc",
                     "topup_wallet", "settle_day", "seed", "db-status", "database_view",
                     "api", "static", "assets", "bank"]
        if not any(path.startswith(p) for p in api_paths):
            return RedirectResponse(url="/pos")
    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Not found")
