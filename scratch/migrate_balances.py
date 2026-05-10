import sys
sys.path.append('/Users/aniyabaghirova/Documents/BreezeBand')
from database import SessionLocal
import models
import redis

db = SessionLocal()
r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

subs = db.query(models.SubAccount).all()
for sub in subs:
    child_wallet = db.query(models.Wallet).filter(models.Wallet.id == sub.child_wallet_id).first()
    master_wallet = db.query(models.Wallet).filter(models.Wallet.id == sub.family.master_wallet_id).first()
    
    if child_wallet.balance > 0:
        print(f"Moving {child_wallet.balance} AZN from child {child_wallet.nfc_uid} to master {master_wallet.nfc_uid}")
        master_wallet.balance += child_wallet.balance
        child_wallet.balance = 0.0
        
        # update redis
        r.set(f"wallet:{master_wallet.nfc_uid}:balance", master_wallet.balance)
        r.set(f"wallet:{child_wallet.nfc_uid}:balance", 0.0)

db.commit()
print("Migration done.")
