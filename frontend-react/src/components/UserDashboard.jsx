import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../api'
import FamilyWallet from './FamilyWallet'

export default function UserDashboard({ setIsAdmin, setUid, uid: propUid }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [status, setStatus]   = useState({ msg: '', type: '' })
  const [isScanning, setIsScanning] = useState(false)
  const [manualUid, setManualUid]   = useState('')
  const [loadAmount, setLoadAmount] = useState('')
  const [loadStatus, setLoadStatus] = useState({ msg: '', type: '' })
  const [loadLoading, setLoadLoading] = useState(false)

  // Password gate state
  const [pendingUid, setPendingUid]       = useState(null)   // uid waiting for password
  const [pendingName, setPendingName]     = useState('')     // user's name (for greeting)
  const [pwInput, setPwInput]             = useState('')
  const [pwError, setPwError]             = useState('')
  const [pwLoading, setPwLoading]         = useState(false)

  // Auto-load profile from DB when uid is available (after refresh or re-login)
  useEffect(() => {
    if (propUid && !profile) {
      beginLogin(propUid)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propUid])

  // ── Step 1: check if password needed ──────────────────────────────────────
  const beginLogin = async (uid) => {
    uid = uid.toLowerCase().trim()
    setStatus({ msg: 'Checking account…', type: 'status-waiting' })
    try {
      const res  = await fetch(`${API_BASE}/check/${uid}`)
      if (!res.ok) throw new Error('Wristband not found')
      const data = await res.json()

      if (data.has_password) {
        // Show password modal
        setPendingUid(uid)
        setPendingName(data.name)
        setPwInput('')
        setPwError('')
        setStatus({ msg: '', type: '' })
      } else {
        // No password — go straight to unlock
        await unlockWithPassword(uid, null)
      }
    } catch (err) {
      setStatus({ msg: 'Error: ' + err.message, type: 'status-error' })
    }
  }

  // ── Step 2: unlock (verify password + fetch full profile) ─────────────────
  const unlockWithPassword = async (uid, password) => {
    try {
      const res  = await fetch(`${API_BASE}/profile/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nfc_uid: uid, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Unlock failed')

      const histRes  = await fetch(`${API_BASE}/history/${uid}`)
      const histData = await histRes.json()

      setProfile(data)
      setHistory(histData)
      setPendingUid(null)
      setStatus({ msg: '', type: '' })

      localStorage.setItem('userUid', uid)
      localStorage.setItem('isAdmin', data.is_admin ? 'true' : 'false')
      setUid(uid)
      setIsAdmin(data.is_admin)
    } catch (err) {
      throw err   // re-throw so callers can handle
    }
  }

  // ── Password modal submit ──────────────────────────────────────────────────
  const handlePasswordSubmit = async () => {
    if (!pwInput.trim()) { setPwError('Please enter your password.'); return }
    setPwLoading(true)
    setPwError('')
    try {
      await unlockWithPassword(pendingUid, pwInput.trim())
    } catch (err) {
      setPwError(err.message || 'Incorrect password.')
    } finally {
      setPwLoading(false)
    }
  }

  const handleManualSubmit = async () => {
    const uid = manualUid.trim()
    if (!uid) { setStatus({ msg: 'Enter NFC ID', type: 'status-error' }); return }
    setStatus({ msg: 'Checking account…', type: 'status-waiting' })
    await beginLogin(uid)
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
          setStatus({ msg: 'Checking account…', type: 'status-waiting' })
          await beginLogin(nfc_uid)
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



  const handleLoadDaily = async () => {
    const amount = parseFloat(loadAmount)
    if (!amount || amount <= 0) {
      setLoadStatus({ msg: 'Enter a valid amount.', type: 'status-error' })
      return
    }
    setLoadLoading(true)
    setLoadStatus({ msg: 'Checking bank card...', type: 'status-waiting' })
    try {
      const res = await fetch(`${API_BASE}/load_daily_balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nfc_uid: profile.nfc_uid, amount })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed')
      setLoadStatus({ msg: `✅ ${amount} AZN loaded! Bank balance unchanged.`, type: 'status-success' })
      setProfile(prev => ({ ...prev, wallet_balance: data.wristband_balance, bank_balance: data.bank_balance }))
      setLoadAmount('')
    } catch (err) {
      setLoadStatus({ msg: `❌ ${err.message}`, type: 'status-error' })
    } finally {
      setLoadLoading(false)
    }
  }

  if (!profile) {
    // Password gate modal
    if (pendingUid) {
      return (
        <div style={{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-gradient, #d8ecf8)',padding:16}}>
          <div style={{background:'white',borderRadius:20,overflow:'hidden',width:'100%',maxWidth:360,boxShadow:'0 24px 60px rgba(0,0,0,0.12)'}}>
            <div style={{background:'linear-gradient(135deg,#297288,#1a4f61)',padding:'24px 24px 20px'}}>
              <div style={{color:'rgba(255,255,255,0.7)',fontSize:12,marginBottom:4}}>Welcome back</div>
              <div style={{color:'white',fontFamily:'Playfair Display,serif',fontSize:22,fontWeight:700}}>{pendingName}</div>
              <div style={{color:'rgba(255,255,255,0.55)',fontSize:11,marginTop:6}}>🔒 This wristband is password protected</div>
            </div>
            <div style={{padding:'20px 24px 24px',display:'flex',flexDirection:'column',gap:14}}>
              <div style={{fontSize:13,color:'#555'}}>Enter your password to access the dashboard.</div>
              <input
                type="password"
                autoFocus
                placeholder="Enter password"
                value={pwInput}
                onChange={e => setPwInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                style={{width:'100%',padding:'12px 16px',border:'1px solid rgba(41,114,136,0.3)',borderRadius:10,fontSize:15,fontFamily:'Inter,sans-serif',outline:'none',background:'rgba(41,114,136,0.03)'}}
              />
              {pwError && <div style={{fontSize:13,color:'#d93025',background:'rgba(217,48,37,0.07)',borderRadius:8,padding:'8px 12px'}}>{pwError}</div>}
              <button
                onClick={handlePasswordSubmit}
                disabled={pwLoading}
                style={{padding:'13px',border:'none',borderRadius:10,background:'linear-gradient(135deg,#297288,#1a4f61)',color:'white',fontFamily:'Inter,sans-serif',fontSize:15,fontWeight:600,cursor:'pointer',opacity:pwLoading?0.7:1,transition:'all 0.2s'}}>
                {pwLoading ? 'Checking…' : 'Unlock Dashboard →'}
              </button>
              <button onClick={() => { setPendingUid(null); setPwInput(''); setPwError('') }}
                style={{background:'none',border:'none',color:'#aaa',fontSize:13,cursor:'pointer',padding:'4px'}}>← Back</button>
            </div>
          </div>
        </div>
      )
    }

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

      {/* ── Full-width Hero Banner ── */}
      <div className="hero-section" style={{width: '100%', borderRadius: 0, marginBottom: 0}}>
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-title">WORLD CLASS<br/>RESORT ON THE<br/>CASPIAN SEA</div>
        </div>
      </div>

      <div className="desktop-dashboard" style={{width: '100%'}}>

        {/* ── LEFT COLUMN: Balance + User Info ── */}
        <div className="desktop-left">

          <div className="balance-card">
            <div className="balance-label">Wristband Balance</div>
            <div className="balance-amount">
              {profile.wallet_balance.toFixed(2)}
              <span className="balance-currency">AZN</span>
            </div>
            <div className="balance-sub">Available to spend today</div>
          </div>

          <div className="stat-card" style={{background: 'rgba(255,255,255,0.7)'}}>
            <div className="stat-label">Logged in as</div>
            <div style={{fontWeight: 700, color: 'var(--text-secondary)', fontSize: 18}}>{profile.name}</div>
            <div className="stat-subtext" style={{marginTop: 4}}>NFC: {profile.nfc_uid}</div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Cards ── */}
        <div className="desktop-right" style={{paddingTop: 0}}>

          {/* ── Load Daily Balance Card ── */}
          <div style={{
            marginBottom: 24,
            background: 'white',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(41,114,136,0.12)',
            border: '1px solid rgba(41,114,136,0.1)'
          }}>
            {/* Header strip */}
            <div style={{
              background: 'linear-gradient(135deg, #297288, #1a4f61)',
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{color: 'white', fontWeight: 700, fontSize: 16, letterSpacing: 0.3}}>Load Daily Balance</div>
                <div style={{color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2}}>Pre-authorize from your bank card · resets at 3 AM</div>
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 12,
                padding: '6px 12px',
                fontSize: 12,
                color: 'white',
                fontWeight: 600,
                whiteSpace: 'nowrap'
              }}>
                🏦 {profile.bank_balance?.toFixed(2) ?? '—'} AZN
              </div>
            </div>

            {/* Body */}
            <div style={{padding: '18px 20px'}}>
              <div style={{fontSize: 12, color: '#666', marginBottom: 14, lineHeight: 1.5}}>
                Your bank card <strong>won't be charged</strong> now. Only what you actually spend today gets deducted at end of day. You can top up multiple times.
              </div>
              <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                <input
                  type="number"
                  min="1"
                  className="modern-input"
                  style={{flex: 1, fontSize: 15, padding: '12px 16px'}}
                  placeholder="Enter amount (AZN)"
                  value={loadAmount}
                  onChange={e => setLoadAmount(e.target.value)}
                />
                <button
                  className="btn-primary"
                  style={{minHeight: '48px', padding: '0 24px', whiteSpace: 'nowrap', borderRadius: 10, fontSize: 14}}
                  onClick={handleLoadDaily}
                  disabled={loadLoading}
                >
                  {loadLoading ? '...' : '+ Add'}
                </button>
              </div>
              {loadStatus.msg && <div className={`status-msg ${loadStatus.type}`} style={{marginTop: 10}}>{loadStatus.msg}</div>}
            </div>
          </div>

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

          {/* ── Family Wallet Panel ── */}
          <div style={{marginTop: 32}}>
            <FamilyWallet nfcUid={profile.nfc_uid} />
          </div>

        </div>{/* end desktop-right */}
      </div>{/* end desktop-dashboard */}
    </div>
  )
}
