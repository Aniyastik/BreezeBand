import os
import json
from dotenv import load_dotenv

load_dotenv()

from main import RealLLM

context = {
    "age": 25,
    "balance": 100,
    "bank_balance": 500,
    "location": "Lobby",
    "vendors": [{"name": "Test", "age_restricted": False}]
}

print("OPENAI_API_KEY IS:", repr(os.environ.get("OPENAI_API_KEY")))
try:
    resp = RealLLM.generate_response("hello", context)
    print("RESPONSE:", resp)
except Exception as e:
    print("ERROR:", e)
