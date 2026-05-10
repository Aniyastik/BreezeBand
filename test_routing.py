from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
app = FastAPI()

@app.get("/profile/{uid}")
def get_profile(uid: str):
    raise HTTPException(status_code=404, detail="Not found profile")

@app.get("/{path:path}")
def catch_all(path: str):
    return HTMLResponse(content="<html>CATCHALL</html>", status_code=200)
