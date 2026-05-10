import sys
import os
sys.path.append('/Users/aniyabaghirova/Documents/BreezeBand')
from database import SessionLocal
import models
import redis

db = SessionLocal()
nfc_uid = "04:bf:1f:7e:cb:2a:81".lower()

wallet = db.query(models.Wallet).filter(models.Wallet.nfc_uid == nfc_uid).first()
if not wallet:
    print("Wallet not found.")
    sys.exit(0)

print(f"Wallet Balance (PG): {wallet.balance}, Debt: {wallet.debt}")

sub = db.query(models.SubAccount).filter(models.SubAccount.child_wallet_id == wallet.id).first()
if sub:
    print(f"User is a CHILD. Age: {sub.age}, Daily Limit: {sub.daily_spending_limit}, Current Spend: {sub.current_daily_spend}")
    master_wallet = db.query(models.Wallet).filter(models.Wallet.id == sub.family.master_wallet_id).first()
    print(f"Master Wallet NFC: {master_wallet.nfc_uid}, PG Balance: {master_wallet.balance}, Debt: {master_wallet.debt}")
    pay_nfc = master_wallet.nfc_uid
else:
    print("User is a SOLO/MASTER account.")
    pay_nfc = wallet.nfc_uid

r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
try:
    redis_bal = r.get(f"wallet:{pay_nfc}:balance")
    print(f"Redis Balance for {pay_nfc}: {redis_bal}")
except Exception as e:
    print(f"Redis error: {e}")
