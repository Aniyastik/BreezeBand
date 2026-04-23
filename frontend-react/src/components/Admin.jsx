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
      setStatus({ msg: "NFC ID daxil edin", type: "status-error" })
      return
    }

    setStatus({ msg: "Axtarılır...", type: "status-waiting" })
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
        setStatus({ msg: `Xəta: ${err.detail}`, type: "status-error" })
        setUser(null)
      }
    } catch (err) {
      setStatus({ msg: 'Baza ilə əlaqə kəsildi', type: "status-error" })
      setUser(null)
    }
  }

  const handleSettle = async () => {
    setIsProcessing(true)
    setStatus({ msg: "Hesablaşma aparılır... Gözləyin", type: "status-waiting" })
    
    try {
      const response = await fetch(`${API_BASE}/settle_day`, { 
        method: 'POST',
        headers: { 'X-Admin-UID': adminUid }
      })
      const data = await response.json()
      
      if (response.ok) {
        setStatus({ msg: `Uğurlu! ${data.message} Çəkilən məbləğ: ${data.total_settled} AZN`, type: "status-success" })
      } else {
        setStatus({ msg: `Xəta: ${data.detail}`, type: "status-error" })
      }
    } catch (error) {
      setStatus({ msg: "Serverə qoşulmaq alınmadı: " + error.message, type: "status-error" })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="brutalist-card max-w-lg">
      <h2 className="title-block">Admin Dashboard</h2>
      
      <div className="admin-controls mb-xl">
          <p className="text-muted mb-md text-sm">
            Sistem avtomatik olaraq hər 2 dəqiqədən bir gün sonunu edir.
          </p>
          <button 
            className="btn-primary w-full" 
            onClick={handleSettle}
            disabled={isProcessing}
          >
            {isProcessing ? 'Gözləyin...' : 'Manual Hesablaşma'}
          </button>
      </div>

      <div className="divider-thick mb-xl"></div>

      <h3 className="section-title">İstifadəçi Axtarışı</h3>
      <div className="input-group mb-lg">
        <div className="flex-row gap-md">
          <input 
            type="text" 
            className="brutalist-input"
            placeholder="NFC ID (Məs: A1-B2)" 
            value={searchUid}
            onChange={(e) => setSearchUid(e.target.value)}
          />
          <button className="btn-secondary whitespace-nowrap" onClick={handleSearch}>Axtar</button>
        </div>
      </div>

      {status.msg && <div className={`status-msg ${status.type} mb-md`}>{status.msg}</div>}

      {user && (
        <div className="user-details-panel">
            <div className="detail-row">
              <span className="detail-label">Ad:</span>
              <span className="detail-value font-bold">{user.name}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">NFC ID:</span>
              <span className="detail-value neon-text">{user.nfc_uid}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">İcazə:</span>
              <span className={`detail-value ${user.is_admin ? 'text-success' : 'text-muted'}`}>{user.is_admin ? 'Admin' : 'İstifadəçi'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Qolbaq Balansı:</span>
              <span className="detail-value text-success font-bold">{user.wallet_balance} AZN</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Bank Kartı:</span>
              <span className="detail-value text-xs">{user.bank_account}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Real Bank Balansı:</span>
              <span className="detail-value font-bold">{user.bank_balance} AZN</span>
            </div>
        </div>
      )}
    </div>
  )
}
