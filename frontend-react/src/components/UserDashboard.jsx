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
  const [topupAmount, setTopupAmount] = useState('')
  const [isToppingUp, setIsToppingUp] = useState(false)

  const handleTopup = async () => {
    if (!topupAmount || isNaN(topupAmount) || Number(topupAmount) <= 0) {
      alert("Please enter a valid amount")
      return
    }
    setIsToppingUp(true)
    try {
      const response = await fetch(`${API_BASE}/topup_bank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nfc_uid: profile.nfc_uid,
          amount: parseFloat(topupAmount)
        })
      })
      const data = await response.json()
      if (response.ok) {
        alert(data.message)
        await fetchDashboardData(profile.nfc_uid)
        setTopupAmount('')
      } else {
        alert("Error: " + data.detail)
      }
    } catch (err) {
      alert("Top up failed: " + err.message)
    } finally {
      setIsToppingUp(false)
    }
  }

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
    <div className="w-full" style={{paddingBottom: '40px'}}>
      <div className="hero-section">
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-title">WORLD CLASS<br/>RESORT ON THE<br/>CASPIAN SEA</div>
        </div>
      </div>
      
      <div className="w-full max-w-md" style={{marginTop: '-40px'}}>
        <div className="grid-2col mb-xl px-md" style={{padding: '0 16px'}}>
            <div className="stat-card highlight">
                <div className="stat-label" style={{color: 'rgba(255,255,255,0.8)'}}>Wristband</div>
                <div className="stat-value">{profile.wallet_balance.toFixed(2)}</div>
                <div className="stat-subtext" style={{color: 'rgba(255,255,255,0.8)'}}>AZN (Spendable)</div>
            </div>
            <div className="stat-card">
                <div className="stat-label">Bank Balance</div>
                <div className="stat-value" style={{color: 'var(--text-secondary)'}}>{profile.bank_balance.toFixed(2)}</div>
                <div className="stat-subtext">AZN</div>
            </div>
        </div>

        <div className="px-md mb-xl" style={{padding: '0 16px'}}>
            <div className="stat-card">
                <div className="stat-label">Top up Bank Account</div>
                <div className="flex-row gap-sm mt-sm">
                   <input 
                     type="number" 
                     className="modern-input text-sm py-sm px-sm flex-1" 
                     placeholder="Amount (AZN)" 
                     value={topupAmount}
                     onChange={e => setTopupAmount(e.target.value)}
                   />
                   <button 
                     className="btn-primary text-sm py-sm px-sm" 
                     style={{minHeight: '44px'}}
                     onClick={handleTopup}
                     disabled={isToppingUp}
                   >
                     {isToppingUp ? '...' : '+ Add'}
                   </button>
                </div>
            </div>
        </div>

        <div className="px-md" style={{padding: '0 16px'}}>
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
