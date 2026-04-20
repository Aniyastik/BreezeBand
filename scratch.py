from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

app = FastAPI()

@app.post("/register_nfc")
def register_nfc():
    return {"status": "ok"}

@app.get("/{full_path:path}")
def catch_all(full_path: str):
    return {"catch": full_path}

client = TestClient(app)

print("POST /register_nfc ->", client.post("/register_nfc").status_code)
print("POST //register_nfc ->", client.post("//register_nfc").status_code)
print("POST /register_nfc/ ->", client.post("/register_nfc/").status_code)
