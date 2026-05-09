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

  // Debt state
  const [debtPaying, setDebtPaying] = useState(false)
  const [debtMsg, setDebtMsg]       = useState({ text: '', ok: true })

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


  const handlePayDebt = async () => {
    setDebtPaying(true)
    setDebtMsg({ text: '', ok: true })
    try {
      const res = await fetch(`${API_BASE}/pay_debt/${profile.nfc_uid}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Payment failed')
      setDebtMsg({ text: `✅ ${data.message}`, ok: true })
      setProfile(prev => ({ ...prev, debt: 0, bank_balance: data.new_bank_balance ?? prev.bank_balance }))
    } catch (err) {
      setDebtMsg({ text: `❌ ${err.message}`, ok: false })
    } finally {
      setDebtPaying(false)
    }
  }

  const hasDebt = (profile.debt ?? 0) > 0

  return (
    <div className="w-full" style={{paddingBottom: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>

      {/* ── Full-width Hero Banner ── */}
      <div className="hero-section" style={{width: '100%', borderRadius: 0, marginBottom: 0}}>
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-title">WORLD CLASS<br/>RESORT ON THE<br/>CASPIAN SEA</div>
        </div>
      </div>

      {/* ── DEBT BANNER ── */}
      {hasDebt && (
        <div style={{
          width: '100%', maxWidth: 1100, margin: '0 auto',
          padding: '0 40px',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #d93025 0%, #a51d13 100%)',
            borderRadius: 16, padding: '20px 24px',
            marginTop: 20,
            color: 'white',
            boxShadow: '0 8px 32px rgba(217,48,37,0.3)',
          }}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
              <span style={{fontSize:22}}>⚠️</span>
              <div style={{fontFamily:'Playfair Display,serif',fontSize:18,fontWeight:700}}>Wristband Locked</div>
            </div>
            <div style={{fontSize:13,opacity:0.9,lineHeight:1.6,marginBottom:14}}>
              Your bank account didn't have enough funds during settlement.
              You owe <strong>{profile.debt.toFixed(2)} AZN</strong>. 
              Your wristband is <strong>blocked</strong> until this debt is cleared.
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <button onClick={handlePayDebt} disabled={debtPaying}
                style={{
                  padding:'12px 28px', border:'2px solid white', borderRadius:10,
                  background:'rgba(255,255,255,0.15)', color:'white',
                  fontFamily:'Inter,sans-serif', fontSize:14, fontWeight:700,
                  cursor:'pointer', backdropFilter:'blur(4px)',
                  opacity: debtPaying ? 0.7 : 1, transition:'all 0.2s',
                }}>
                {debtPaying ? 'Processing…' : `💳 Pay ${profile.debt.toFixed(2)} AZN Now`}
              </button>
              <span style={{fontSize:11,opacity:0.7}}>Charges your linked bank card automatically</span>
            </div>
            {debtMsg.text && (
              <div style={{
                marginTop:12, padding:'10px 14px', borderRadius:8,
                background: debtMsg.ok ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
                fontSize:13, fontWeight:600
              }}>
                {debtMsg.text}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="desktop-dashboard" style={{width: '100%', opacity: hasDebt ? 0.4 : 1, pointerEvents: hasDebt ? 'none' : 'auto'}}>

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

          {/* Debt Status Card */}
          <div className="stat-card" style={{
            background: hasDebt ? 'rgba(217,48,37,0.06)' : 'rgba(24,128,56,0.06)',
            border: `1px solid ${hasDebt ? 'rgba(217,48,37,0.2)' : 'rgba(24,128,56,0.2)'}`,
          }}>
            <div className="stat-label">{hasDebt ? '⚠️ Outstanding Debt' : '✅ Outstanding Debt'}</div>
            <div style={{
              fontWeight: 700, fontSize: 22,
              color: hasDebt ? '#d93025' : '#188038',
              fontFamily: 'Inter, sans-serif'
            }}>
              {(profile.debt ?? 0).toFixed(2)} <span style={{fontSize: 13, fontWeight: 600}}>AZN</span>
            </div>
            <div className="stat-subtext" style={{marginTop: 4}}>
              {hasDebt ? 'Wristband locked — pay to unlock' : 'No debt — you\'re all clear'}
            </div>
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

          <h3 className="section-title" style={{marginTop: 0}}>Transaction History</h3>

          {history.length === 0 ? (
            <div className="empty-state">No transactions yet.</div>
          ) : (() => {
            // Group transactions by date
            const grouped = {}
            const today = new Date(); today.setHours(0,0,0,0)
            const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)

            history.forEach(tx => {
              const d = new Date(tx.timestamp); d.setHours(0,0,0,0)
              let label
              if (d.getTime() === today.getTime()) label = 'Today'
              else if (d.getTime() === yesterday.getTime()) label = 'Yesterday'
              else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              if (!grouped[label]) grouped[label] = []
              grouped[label].push(tx)
            })

            const statusLabel = (s) => {
              if (s === 'completed') return { text: 'Settled', color: '#188038', bg: 'rgba(24,128,56,0.08)' }
              if (s === 'settled_with_debt') return { text: 'Settled (debt)', color: '#d93025', bg: 'rgba(217,48,37,0.08)' }
              return { text: 'Processing', color: '#e37400', bg: 'rgba(227,116,0,0.08)' }
            }

            return Object.entries(grouped).map(([dateLabel, txs]) => (
              <div key={dateLabel} style={{marginBottom: 20}}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: 1,
                  marginBottom: 8, paddingBottom: 6,
                  borderBottom: '1px solid rgba(41,114,136,0.1)'
                }}>
                  {dateLabel}
                </div>
                <div className="history-list" style={{gap: 6}}>
                  {txs.map(tx => {
                    const st = statusLabel(tx.status)
                    return (
                      <div key={tx.id} className="history-item" style={{borderLeft: `3px solid ${st.color}`}}>
                        <div className="history-details">
                          <span className="font-bold" style={{color: 'var(--text-primary)'}}>{tx.vendor_name}</span>
                          <div style={{display:'flex',gap:8,alignItems:'center',marginTop:3}}>
                            <span className="text-xs text-muted">
                              {new Date(tx.timestamp).toLocaleString('en-US', {hour: 'numeric', minute: '2-digit'})}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: st.color,
                              background: st.bg, padding: '2px 8px', borderRadius: 6
                            }}>
                              {st.text}
                            </span>
                          </div>
                        </div>
                        <span style={{fontWeight: 700, fontSize: 15, color: st.color}}>
                          -{tx.amount.toFixed(2)} AZN
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          })()}

          {/* ── Family Wallet Panel ── */}
          <div style={{marginTop: 32}}>
            <FamilyWallet nfcUid={profile.nfc_uid} />
          </div>

        </div>{/* end desktop-right */}
      </div>{/* end desktop-dashboard */}
    </div>
  )
}
