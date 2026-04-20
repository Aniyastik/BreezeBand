import { useState } from 'react'
import { API_BASE } from '../api'

export default function Registration() {
  const [userName, setUserName] = useState('')
  const [balance, setBalance] = useState('0')
  const [status, setStatus] = useState({ msg: 'Zəhmət olmasa məlumatları doldurun', type: '' })
  const [isScanning, setIsScanning] = useState(false)
  const handleScan = async () => {
    const name = userName.trim()
    const initBalance = parseFloat(balance)

    if (!name) {
      setStatus({ msg: "İstifadəçi adını daxil edin!", type: "status-error" })
      return
    }

    if (isScanning) return;

    try {
      if ('NDEFReader' in window) {
        setIsScanning(true);
        const ndef = new window.NDEFReader()
        await ndef.scan()
        setStatus({ msg: "Qolbağı telefona yaxınlaşdırın...", type: "status-waiting" })

        ndef.onreadingerror = () => {
          setStatus({ msg: "Oxuma xətası. Yenidən cəhd edin.", type: "status-error" });
        };

        // Bircə dəfə oxumaq üçün flag
        let hasRead = false;

        ndef.onreading = async (event) => {
          if (hasRead) return;
          hasRead = true;
          
          const nfc_uid = event.serialNumber;
          setStatus({ msg: "Oxundu, qeydiyyat aparılır...", type: "status-waiting" });
          
          try {
            await registerUserNFC(name, nfc_uid, initBalance);
          } finally {
            setIsScanning(false);
          }
        }
      } else {
        setStatus({ msg: "NFC dəstəklənmir. (Yalnız Android Chrome HTTPS)", type: "status-error" })
      }
    } catch (error) {
      setIsScanning(false);
      setStatus({ msg: "NFC xətası: " + error.message, type: "status-error" })
    }
  }

  const registerUserNFC = async (name, uid, bal) => {
    try {
      const response = await fetch(`${API_BASE}/register_nfc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_name: name,
          nfc_uid: uid,
          initial_balance: isNaN(bal) ? 0 : bal
        })
      })

      let data;
      const text = await response.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { detail: "Sistem xətası (Server boş cavab qaytardı)" };
      }

      if (response.ok) {
        setStatus({ msg: `Uğurlu! Balans: ${data.balance} AZN`, type: "status-success" })
        setUserName('')
        setBalance('0')
      } else if (response.status === 405) {
        setStatus({ msg: "Xəta 405: Siz backend əvəzinə frontend (Railway) URL-ni daxil etmisiniz. Ayarlardan əsl FastAPI backend linkini yazın!", type: "status-error" });
      } else {
        setStatus({ msg: `Xəta: ${data.detail || 'Naməlum xəta'}`, type: "status-error" })
      }
    } catch (error) {
      setStatus({ msg: "Serverə qoşulmaq alınmadı: " + error.message, type: "status-error" })
    }
  }

  return (
    <div className="glass-card">
      <h2>Qolbaq Qeydiyyatı</h2>
      <div className="input-group">
        <label>İstifadəçi Adı</label>
        <input 
          type="text" 
          placeholder="Məs: Aniya" 
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
        />
      </div>
      <div className="input-group currency-suffix">
        <label>İlkin Balans (AZN)</label>
        <input 
          type="number" 
          placeholder="0.00" 
          step="0.01" 
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
        />
      </div>
      <button 
        className="btn-primary" 
        onClick={handleScan}
        disabled={isScanning}
      >
        {isScanning ? 'Skaner Aktivdir...' : 'Stikeri Oxut və Qeyd Et'}
      </button>
      {status.msg && <div className={`status-msg ${status.type}`}>{status.msg}</div>}
    </div>
  )
}
