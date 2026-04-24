import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../api'

export default function Register({ adminUid }) {
  const navigate = useNavigate()
  const [userName, setUserName] = useState('')
  const [nfcUid, setNfcUid] = useState('')
  const [initialBalance, setInitialBalance] = useState('')
  const [status, setStatus] = useState({ msg: '', type: '' })
  const [isScanning, setIsScanning] = useState(false)

  const handleScan = async () => {
    if (isScanning) return

    try {
      if ('NDEFReader' in window) {
        setIsScanning(true)
        const ndef = new window.NDEFReader()
        await ndef.scan()
        setStatus({ msg: "Bring the wristband closer to the phone...", type: "status-waiting" })

        ndef.onreadingerror = () => {
          setStatus({ msg: "Reading error. Please try again.", type: "status-error" })
        }

        ndef.onreading = (event) => {
          setNfcUid(event.serialNumber)
          setStatus({ msg: "Wristband scanned successfully!", type: "status-success" })
          setIsScanning(false)
        }
      } else {
        setStatus({ msg: "NFC not supported. (Android Chrome HTTPS only)", type: "status-error" })
      }
    } catch (error) {
      setIsScanning(false)
      setStatus({ msg: "NFC Error: " + error.message, type: "status-error" })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!userName.trim() || !nfcUid.trim() || !initialBalance) {
      setStatus({ msg: "Please fill in all fields.", type: "status-error" })
      return
    }

    setStatus({ msg: "Registering user...", type: "status-waiting" })

    try {
      const headers = { 'Content-Type': 'application/json' }
      if (adminUid) {
        headers['X-Admin-UID'] = adminUid
      }

      const response = await fetch(`${API_BASE}/register_nfc`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_name: userName.trim(),
          nfc_uid: nfcUid.trim(),
          initial_balance: parseFloat(initialBalance)
        })
      })
      
      const data = await response.json()

      if (response.ok) {
        setStatus({ msg: `Success! ${data.message} Balance: ${data.balance} AZN`, type: "status-success" })
        setUserName('')
        setNfcUid('')
        setInitialBalance('')
        setTimeout(() => navigate('/dashboard'), 2000)
      } else {
        setStatus({ msg: `Error: ${data.detail}`, type: "status-error" })
      }
    } catch (error) {
      setStatus({ msg: "Failed to connect to server: " + error.message, type: "status-error" })
    }
  }

  return (
    <div className="brutalist-card max-w-lg relative">
      <button 
        className="text-muted text-sm mb-md underline cursor-pointer"
        onClick={() => navigate('/dashboard')}
        style={{ background: 'none', border: 'none', padding: 0 }}
      >
        ← Back to Login
      </button>

      <h2 className="title-block">Register Wristband</h2>
      
      <p className="text-muted mb-lg text-sm">
        Register a new NFC wristband to a user. This will automatically create a bank account for them.
      </p>

      <form onSubmit={handleSubmit} className="mb-lg">
        <div className="input-group mb-md">
          <label className="brutalist-label">User Name</label>
          <input 
            type="text" 
            className="brutalist-input"
            placeholder="E.g. John Doe" 
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
        </div>

        <div className="input-group mb-md">
          <label className="brutalist-label">NFC UID</label>
          <div className="flex-row gap-md">
            <input 
              type="text" 
              className="brutalist-input flex-1"
              placeholder="E.g. A1-B2-C3-D4" 
              value={nfcUid}
              onChange={(e) => setNfcUid(e.target.value)}
            />
            <button 
              type="button" 
              className="btn-secondary whitespace-nowrap" 
              onClick={handleScan}
              disabled={isScanning}
            >
              {isScanning ? 'Scanning...' : 'Scan Tag'}
            </button>
          </div>
        </div>

        <div className="input-group mb-lg">
          <label className="brutalist-label">Initial Balance (AZN)</label>
          <input 
            type="number" 
            step="0.01"
            className="brutalist-input"
            placeholder="0.00" 
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary w-full">
          Register User
        </button>
      </form>

      {status.msg && <div className={`status-msg ${status.type}`}>{status.msg}</div>}
    </div>
  )
}
