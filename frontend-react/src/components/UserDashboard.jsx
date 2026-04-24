import { useState } from 'react'
import { API_BASE } from '../api'

export default function UserDashboard({ setIsAdmin, setUid }) {
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState({ msg: 'Scan wristband to access your account', type: '' })
  const [isScanning, setIsScanning] = useState(false)
  const [manualUid, setManualUid] = useState('')

  const handleManualSubmit = async () => {
    const uid = manualUid.trim()
    if (!uid) {
      setStatus({ msg: "Enter NFC ID", type: "status-error" })
      return
    }
    
    setStatus({ msg: "Checking account...", type: "status-waiting" });
    await fetchDashboardData(uid);
  }

  const handleScan = async () => {
    if (isScanning) return;

    try {
      if ('NDEFReader' in window) {
        setIsScanning(true);
        const ndef = new window.NDEFReader()
        ndef.scan()
        setStatus({ msg: "Bring the wristband closer to the phone...", type: "status-waiting" })

        ndef.onreadingerror = () => {
          setStatus({ msg: "Reading error. Please try again.", type: "status-error" });
        };

        ndef.onreading = async (event) => {
          const nfc_uid = event.serialNumber
          setStatus({ msg: "Checking account...", type: "status-waiting" })
          await fetchDashboardData(nfc_uid)
          setIsScanning(false);
        }
      } else {
        setStatus({ msg: "NFC not supported. (Android Chrome HTTPS only)", type: "status-error" })
      }
    } catch (error) {
      setIsScanning(false);
      setStatus({ msg: "NFC Error: " + error.message, type: "status-error" })
    }
  }

  const fetchDashboardData = async (uid) => {
    try {
      const profRes = await fetch(`${API_BASE}/profile/${uid}`)
      if (!profRes.ok) throw new Error("Profile not found")
      const profData = await profRes.json()
      
      const histRes = await fetch(`${API_BASE}/history/${uid}`)
      const histData = await histRes.json()
      
      setProfile(profData)
      setHistory(histData)
      setStatus({ msg: "", type: "" })
      
      localStorage.setItem('userUid', uid)
      localStorage.setItem('isAdmin', profData.is_admin ? 'true' : 'false')
      setUid(uid)
      setIsAdmin(profData.is_admin)
    } catch (error) {
      setStatus({ msg: "Error: " + error.message, type: "status-error" })
      setProfile(null)
    }
  }

  const handleLogout = () => {
    setProfile(null);
    localStorage.removeItem('userUid');
    localStorage.removeItem('isAdmin');
    setUid(null);
    setIsAdmin(false);
  };

  if (!profile) {
    return (
      <div className="brutalist-card max-w-md">
        <h2 className="title-block">User Dashboard</h2>
        <div className="input-group">
          <label className="brutalist-label">Manual NFC ID</label>
          <div className="flex-row gap-md">
            <input 
              type="text" 
              className="brutalist-input"
              placeholder="E.g. A1-B2" 
              value={manualUid}
              onChange={(e) => setManualUid(e.target.value)}
            />
            <button className="btn-primary" onClick={handleManualSubmit}>Login</button>
          </div>
        </div>
        
        <div className="divider-text">- OR -</div>

        <button 
          className="btn-primary w-full" 
          onClick={handleScan}
          disabled={isScanning}
        >
          {isScanning ? 'Scanner Active...' : 'Login (Scan Wristband)'}
        </button>
        {status.msg && <div className={`status-msg ${status.type} mt-md`}>{status.msg}</div>}
      </div>
    )
  }

  return (
    <div className="brutalist-card max-w-lg">
      <h2 className="title-block">Welcome, {profile.name}!</h2>
      <div className="neon-text mb-lg">Sticker ID: {profile.nfc_uid}</div>
      
      <div className="grid-2col mb-xl">
          <div className="stat-panel">
              <div className="stat-label">Real Bank Balance</div>
              <div className="stat-value">{profile.bank_balance.toFixed(2)} AZN</div>
              <div className="stat-subtext">{profile.bank_account}</div>
          </div>
          <div className="stat-panel highlight-panel">
              <div className="stat-label neon-text">Wristband (Spendable)</div>
              <div className="stat-value neon-text">{profile.wallet_balance.toFixed(2)} AZN</div>
              <div className="stat-subtext">Your Daily Limit</div>
          </div>
      </div>

      <h3 className="section-title">Today's Transactions</h3>
      
      {history.length === 0 ? (
          <div className="empty-state">No transactions yet.</div>
      ) : (
          <div className="history-list">
              {history.map(tx => (
                  <div key={tx.id} className={`history-item ${tx.status === 'completed' ? 'border-success' : 'border-warning'}`}>
                      <div className="flex-row justify-between mb-sm">
                          <span className="font-bold">{tx.vendor_name}</span>
                          <span className={`font-bold ${tx.status === 'completed' ? 'text-success' : 'text-warning'}`}>{tx.amount} AZN</span>
                      </div>
                      <div className="flex-row justify-between text-xs text-muted">
                          <span>{new Date(tx.timestamp).toLocaleString('en-US')}</span>
                          <span>{tx.status === 'completed' ? 'Settled' : 'Pending Settlement'}</span>
                      </div>
                  </div>
              ))}
          </div>
      )}
      
      <button className="btn-secondary w-full mt-xl" onClick={handleLogout}>Logout</button>
    </div>
  )
}
