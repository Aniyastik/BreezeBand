import { useState } from 'react'
import { API_BASE } from '../api'

export default function UserDashboard({ setIsAdmin, setUid }) {
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState({ msg: 'Hesabınıza daxil olmaq üçün qolbağı oxudun', type: '' })
  const [isScanning, setIsScanning] = useState(false)
  const [manualUid, setManualUid] = useState('')

  const handleManualSubmit = async () => {
    const uid = manualUid.trim()
    if (!uid) {
      setStatus({ msg: "NFC ID daxil edin", type: "status-error" })
      return
    }
    
    setStatus({ msg: "Hesabınız yoxlanılır...", type: "status-waiting" });
    await fetchDashboardData(uid);
  }

  const handleScan = async () => {
    if (isScanning) return;

    try {
      if ('NDEFReader' in window) {
        setIsScanning(true);
        const ndef = new window.NDEFReader()
        await ndef.scan()
        setStatus({ msg: "Qolbağı telefona yaxınlaşdırın...", type: "status-waiting" })

        ndef.onreadingerror = () => {
          setStatus({ msg: "Oxuma xətası. Yenidən cəhd edin.", type: "status-error" });
        };

        ndef.onreading = async (event) => {
          const nfc_uid = event.serialNumber
          setStatus({ msg: "Hesabınız yoxlanılır...", type: "status-waiting" })
          await fetchDashboardData(nfc_uid)
          setIsScanning(false);
        }
      } else {
        setStatus({ msg: "NFC dəstəklənmir. (Yalnız Android Chrome HTTPS)", type: "status-error" })
      }
    } catch (error) {
      setIsScanning(false);
      setStatus({ msg: "NFC xətası: " + error.message, type: "status-error" })
    }
  }

  const fetchDashboardData = async (uid) => {
    try {
      const profRes = await fetch(`${API_BASE}/profile/${uid}`)
      if (!profRes.ok) throw new Error("Profil tapılmadı")
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
      setStatus({ msg: "Xəta: " + error.message, type: "status-error" })
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
        <h2 className="title-block">İstifadəçi Paneli</h2>
        <div className="input-group">
          <label className="brutalist-label">Manual NFC ID</label>
          <div className="flex-row gap-md">
            <input 
              type="text" 
              className="brutalist-input"
              placeholder="Məs: A1-B2" 
              value={manualUid}
              onChange={(e) => setManualUid(e.target.value)}
            />
            <button className="btn-primary" onClick={handleManualSubmit}>Giriş</button>
          </div>
        </div>
        
        <div className="divider-text">- VƏ YA -</div>

        <button 
          className="btn-primary w-full" 
          onClick={handleScan}
          disabled={isScanning}
        >
          {isScanning ? 'Skaner Aktivdir...' : 'Giriş (Qolbağı Oxut)'}
        </button>
        {status.msg && <div className={`status-msg ${status.type} mt-md`}>{status.msg}</div>}
      </div>
    )
  }

  return (
    <div className="brutalist-card max-w-lg">
      <h2 className="title-block">Xoş gəldin, {profile.name}!</h2>
      <div className="neon-text mb-lg">Stiker ID: {profile.nfc_uid}</div>
      
      <div className="grid-2col mb-xl">
          <div className="stat-panel">
              <div className="stat-label">Real Bank Balansı</div>
              <div className="stat-value">{profile.bank_balance.toFixed(2)} AZN</div>
              <div className="stat-subtext">{profile.bank_account}</div>
          </div>
          <div className="stat-panel highlight-panel">
              <div className="stat-label neon-text">Bilezik (Xərclənə bilən)</div>
              <div className="stat-value neon-text">{profile.wallet_balance.toFixed(2)} AZN</div>
              <div className="stat-subtext">Gündəlik Limitiniz</div>
          </div>
      </div>

      <h3 className="section-title">Bu günün əməliyyatları</h3>
      
      {history.length === 0 ? (
          <div className="empty-state">Hələ heç bir əməliyyat yoxdur.</div>
      ) : (
          <div className="history-list">
              {history.map(tx => (
                  <div key={tx.id} className={`history-item ${tx.status === 'completed' ? 'border-success' : 'border-warning'}`}>
                      <div className="flex-row justify-between mb-sm">
                          <span className="font-bold">{tx.vendor_name}</span>
                          <span className={`font-bold ${tx.status === 'completed' ? 'text-success' : 'text-warning'}`}>{tx.amount} AZN</span>
                      </div>
                      <div className="flex-row justify-between text-xs text-muted">
                          <span>{new Date(tx.timestamp).toLocaleString('az-AZ')}</span>
                          <span>{tx.status === 'completed' ? 'Bankdan çıxılıb' : 'Gün sonunu gözləyir'}</span>
                      </div>
                  </div>
              ))}
          </div>
      )}
      
      <button className="btn-secondary w-full mt-xl" onClick={handleLogout}>Çıxış</button>
    </div>
  )
}
