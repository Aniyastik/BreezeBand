import { useState } from 'react'
import { API_BASE } from '../api'

export default function PosTerminal() {
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState({ msg: 'Hazırdır', type: '' })

  const handleScan = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) {
      setStatus({ msg: "Məbləği düzgün daxil edin", type: "status-error" })
      return
    }

    try {
      if ('NDEFReader' in window) {
        const ndef = new window.NDEFReader()
        await ndef.scan()
        setStatus({ msg: "Qolbağı telefona yaxınlaşdırın...", type: "status-waiting" })

        ndef.onreading = async (event) => {
          const nfc_uid = event.serialNumber
          setStatus({ msg: "Oxunur... Zəhmət olmasa gözləyin", type: "status-waiting" })
          await processPayment(nfc_uid, amt)
        }
      } else {
        setStatus({ msg: "NFC dəstəklənmir. (Yalnız Android Chrome HTTPS)", type: "status-error" })
      }
    } catch (error) {
      setStatus({ msg: "NFC xətası: " + error.message, type: "status-error" })
    }
  }

  const processPayment = async (uid, amt) => {
    try {
      const response = await fetch(`${API_BASE}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nfc_uid: uid,
          vendor_id: 1,
          amount: amt
        })
      })

      const data = await response.json()

      if (response.ok) {
        setStatus({ msg: `Uğurlu! Qalıq: ${data.remaining_balance} AZN`, type: "status-success" })
        setAmount('')
      } else {
        setStatus({ msg: `Xəta: ${data.detail}`, type: "status-error" })
      }
    } catch (error) {
      setStatus({ msg: "Serverə qoşulmaq alınmadı.", type: "status-error" })
    }
  }

  return (
    <div className="glass-card">
      <div className="pulse-circle">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4h4v2H6v2H4V4zm16 0h-4v2h2v2h2V4zM4 20h4v-2H6v-2H4v4zm16 0h-4v-2h2v-2h2v4z"/>
            <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm0 6a2 2 0 110-4 2 2 0 010 4z"/>
        </svg>
      </div>
      <h2 style={{ marginTop: '20px' }}>POS Terminal</h2>
      <div className="input-group currency-suffix">
        <input 
          type="number" 
          className="large-amount"
          placeholder="0.00" 
          step="0.01" 
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <button className="btn-primary" onClick={handleScan}>Ödəniş Al</button>
      {status.msg && <div className={`status-msg ${status.type}`}>{status.msg}</div>}
    </div>
  )
}
