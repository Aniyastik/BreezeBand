import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../api'

export default function UserDashboard({ setIsAdmin, setUid }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState({ msg: '', type: '' })
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
        await ndef.scan()
        setStatus({ msg: "Bring wristband closer to the phone...", type: "status-waiting" })

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

  if (!profile) {
    return (
      <div className="splash-container">
        <div className="splash-logo">
          <div className="main">SEA BREEZE</div>
          <div className="sub">RESORT</div>
        </div>
        
        <div className="w-full max-w-md" style={{zIndex: 10}}>
          <button 
            className="btn-primary w-full mb-md" 
            onClick={handleScan}
            disabled={isScanning}
          >
            {isScanning ? 'Scanner Active...' : 'LOGIN (SCAN WRISTBAND)'}
          </button>

          <div className="divider-text" style={{color: 'var(--text-secondary)'}}>- OR -</div>

          <button 
            className="btn-secondary w-full mb-lg" 
            onClick={() => navigate('/register')}
          >
            SIGN UP
          </button>

          <div className="mt-xl text-center" style={{backgroundColor: 'rgba(255,255,255,0.4)', padding: '16px', borderRadius: '12px'}}>
            <p className="text-muted text-xs mb-sm">Manual Login (Testing):</p>
            <div className="flex-row gap-sm justify-center">
              <input 
                type="text" 
                className="modern-input text-sm py-sm px-sm"
                style={{ width: '150px' }}
                placeholder="E.g. A1-B2" 
                value={manualUid}
                onChange={(e) => setManualUid(e.target.value)}
              />
              <button className="btn-primary text-sm py-sm px-md" style={{minHeight: '44px'}} onClick={handleManualSubmit}>Login</button>
            </div>
          </div>

          {status.msg && <div className={`status-msg ${status.type} mt-md`}>{status.msg}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full" style={{paddingBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <div className="hero-section" style={{width: '100%'}}>
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-title">WORLD CLASS<br/>RESORT ON THE<br/>CASPIAN SEA</div>
        </div>
      </div>
      
      <div style={{width: '100%', maxWidth: '440px', marginTop: '-40px', padding: '0 16px'}}>
        <div className="mb-xl">
            <div className="stat-card highlight">
                <div className="stat-label" style={{color: 'rgba(255,255,255,0.8)'}}>Wristband Balance</div>
                <div className="stat-value" style={{fontSize: '36px'}}>{profile.wallet_balance.toFixed(2)}</div>
                <div className="stat-subtext" style={{color: 'rgba(255,255,255,0.8)'}}>AZN (Spendable)</div>
            </div>
        </div>

        <div>
            <h3 className="section-title" style={{marginTop: 0}}>Today's Transactions</h3>
            
            {history.length === 0 ? (
                <div className="empty-state">No transactions yet.</div>
            ) : (
                <div className="history-list">
                    {history.map(tx => (
                        <div key={tx.id} className={`history-item ${tx.status === 'completed' ? 'border-success' : 'border-warning'}`}>
                            <div className="history-details">
                                <span className="font-bold" style={{color: 'var(--text-primary)'}}>{tx.vendor_name}</span>
                                <span className="text-xs text-muted mt-xs">{new Date(tx.timestamp).toLocaleString('en-US', {hour: 'numeric', minute: '2-digit'})} • {tx.status === 'completed' ? 'Settled' : 'Pending'}</span>
                            </div>
                            <span className={`history-amount ${tx.status === 'completed' ? 'text-success' : 'text-warning'}`}>{tx.amount} AZN</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  )
}
