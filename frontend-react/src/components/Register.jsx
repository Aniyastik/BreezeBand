import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../api'

export default function Register({ adminUid }) {
  const navigate = useNavigate()
  const [userName, setUserName] = useState('')
  const [nfcUid, setNfcUid] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
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

    if (!userName.trim() || !nfcUid.trim()) {
      setStatus({ msg: "Please fill in name and NFC ID.", type: "status-error" })
      return
    }

    if (password && password !== confirmPw) {
      setStatus({ msg: "Passwords do not match.", type: "status-error" })
      return
    }

    setStatus({ msg: "Registering wristband...", type: "status-waiting" })

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
          password: password.trim() || null,
        })
      })
      
      const data = await response.json()

      if (response.ok) {
        const pwNote = data.has_password ? ' (password protected 🔒)' : ''
        setStatus({ msg: `✅ ${data.message}${pwNote}`, type: "status-success" })
        setUserName('')
        setNfcUid('')
        setPassword('')
        setConfirmPw('')
        setTimeout(() => navigate('/dashboard'), 2000)
      } else {
        setStatus({ msg: `Error: ${data.detail}`, type: "status-error" })
      }
    } catch (error) {
      setStatus({ msg: "Failed to connect to server: " + error.message, type: "status-error" })
    }
  }

  return (
    <div className="w-full max-w-md mt-xl" style={{padding: '0 16px', zIndex: 10}}>
      <div className="modern-card">
        <button 
          className="text-muted text-sm mb-md cursor-pointer"
          onClick={() => navigate('/dashboard')}
          style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'underline' }}
        >
          ← Back
        </button>

        <h2 className="section-title" style={{marginTop: 0}}>Register Wristband</h2>
        
        <p className="text-muted mb-lg text-sm">
          Register a new NFC wristband. A mock bank account with 5,000 AZN will be created automatically.
        </p>

        <form onSubmit={handleSubmit} className="mb-md">
          <div className="input-group mb-md">
            <label className="modern-label">Full Name</label>
            <input 
              type="text" 
              className="modern-input"
              placeholder="E.g. John Doe" 
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>

          <div className="input-group mb-md">
            <label className="modern-label">NFC ID Number</label>
            <div className="flex-row gap-sm">
              <input 
                type="text" 
                className="modern-input flex-1"
                placeholder="A1-B2-C3-D4" 
                value={nfcUid}
                onChange={(e) => setNfcUid(e.target.value)}
              />
              <button 
                type="button" 
                className="btn-secondary whitespace-nowrap px-sm py-sm" 
                style={{minHeight: '44px'}}
                onClick={handleScan}
                disabled={isScanning}
              >
                {isScanning ? '...' : 'Scan Tag'}
              </button>
            </div>
          </div>

          <div className="input-group mb-md">
            <label className="modern-label">🔒 Wristband Password <span style={{fontWeight:400,opacity:0.6}}>(optional)</span></label>
            <input 
              type="password" 
              className="modern-input"
              placeholder="Set a password to protect your band" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {password && (
            <div className="input-group mb-xl">
              <label className="modern-label">Confirm Password</label>
              <input 
                type="password" 
                className="modern-input"
                placeholder="Re-enter password" 
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
              />
            </div>
          )}

          <button type="submit" className="btn-primary w-full">
            Complete Registration
          </button>
        </form>

        {status.msg && <div className={`status-msg ${status.type}`}>{status.msg}</div>}
      </div>
    </div>
  )
}
