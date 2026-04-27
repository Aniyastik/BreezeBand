import { useState } from 'react'
import { API_BASE } from '../api'

export default function Admin({ adminUid }) {
  const [user, setUser] = useState(null)
  const [searchUid, setSearchUid] = useState('')
  const [status, setStatus] = useState({ msg: '', type: '' })
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSearch = async () => {
    const uid = searchUid.trim()
    if (!uid) {
      setStatus({ msg: "Enter NFC ID", type: "status-error" })
      return
    }

    setStatus({ msg: "Searching...", type: "status-waiting" })
    try {
      const res = await fetch(`${API_BASE}/api/users/by-nfc/${uid}`, {
        headers: { 'X-Admin-UID': adminUid }
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data)
        setStatus({ msg: '', type: '' })
      } else {
        const err = await res.json()
        setStatus({ msg: `Error: ${err.detail}`, type: "status-error" })
        setUser(null)
      }
    } catch (err) {
      setStatus({ msg: 'Database connection lost', type: "status-error" })
      setUser(null)
    }
  }

  const handleSettle = async () => {
    setIsProcessing(true)
    setStatus({ msg: "Settlement in progress... Please wait", type: "status-waiting" })
    
    try {
      const response = await fetch(`${API_BASE}/settle_day`, { 
        method: 'POST',
        headers: { 'X-Admin-UID': adminUid }
      })
      const data = await response.json()
      
      if (response.ok) {
        setStatus({ msg: `Success! ${data.message} Settled amount: ${data.total_settled} AZN`, type: "status-success" })
      } else {
        setStatus({ msg: `Error: ${data.detail}`, type: "status-error" })
      }
    } catch (error) {
      setStatus({ msg: "Failed to connect to server: " + error.message, type: "status-error" })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="w-full max-w-lg mt-xl" style={{padding: '0 16px', zIndex: 10}}>
      <div className="modern-card">
        <h2 className="section-title" style={{marginTop: 0}}>Admin Dashboard</h2>
        
        <div className="mb-xl">
            <p className="text-muted mb-md text-sm">
              The system automatically settles end of day every 2 minutes.
            </p>
            <button 
              className="btn-primary w-full" 
              onClick={handleSettle}
              disabled={isProcessing}
            >
              {isProcessing ? 'Please wait...' : 'Manual Settlement'}
            </button>
        </div>

        <div style={{height: 1, backgroundColor: 'var(--border-color)', margin: '24px 0'}}></div>

        <h3 className="section-title" style={{fontSize: '18px'}}>User Search</h3>
        <div className="input-group mb-lg">
          <div className="flex-row gap-sm">
            <input 
              type="text" 
              className="modern-input"
              placeholder="NFC ID (E.g. A1-B2)" 
              value={searchUid}
              onChange={(e) => setSearchUid(e.target.value)}
            />
            <button className="btn-secondary whitespace-nowrap px-md py-sm" style={{minHeight: '44px'}} onClick={handleSearch}>Search</button>
          </div>
        </div>

        {status.msg && <div className={`status-msg ${status.type} mb-md`}>{status.msg}</div>}

        {user && (
          <div style={{backgroundColor: 'rgba(41, 114, 136, 0.05)', borderRadius: '12px', padding: '16px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)'}}>
                <span className="text-muted text-xs text-uppercase font-bold">Name:</span>
                <span className="font-bold">{user.name}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)'}}>
                <span className="text-muted text-xs text-uppercase font-bold">NFC ID:</span>
                <span style={{color: 'var(--text-secondary)', fontWeight: 600}}>{user.nfc_uid}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)'}}>
                <span className="text-muted text-xs text-uppercase font-bold">Role:</span>
                <span className={`${user.is_admin ? 'text-success' : 'text-muted'}`}>{user.is_admin ? 'Admin' : 'User'}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)'}}>
                <span className="text-muted text-xs text-uppercase font-bold">Wristband Balance:</span>
                <span className="text-success font-bold">{user.wallet_balance} AZN</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-color)'}}>
                <span className="text-muted text-xs text-uppercase font-bold">Bank Account:</span>
                <span className="text-xs">{user.bank_account}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '12px 0'}}>
                <span className="text-muted text-xs text-uppercase font-bold">Real Bank Balance:</span>
                <span className="font-bold">{user.bank_balance} AZN</span>
              </div>
          </div>
        )}
      </div>
    </div>
  )
}
