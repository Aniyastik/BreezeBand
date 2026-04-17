import { useState } from 'react'

export default function UserDashboard() {
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState([])
  const [status, setStatus] = useState({ msg: 'Hesabınıza daxil olmaq üçün qolbağı oxudun', type: '' })

  const handleScan = async () => {
    try {
      if ('NDEFReader' in window) {
        const ndef = new window.NDEFReader()
        await ndef.scan()
        setStatus({ msg: "Qolbağı telefona yaxınlaşdırın...", type: "status-waiting" })

        ndef.onreading = async (event) => {
          const nfc_uid = event.serialNumber
          setStatus({ msg: "Hesabınız yoxlanılır...", type: "status-waiting" })
          await fetchDashboardData(nfc_uid)
        }
      } else {
        setStatus({ msg: "NFC dəstəklənmir. (Yalnız Android Chrome HTTPS)", type: "status-error" })
      }
    } catch (error) {
      setStatus({ msg: "NFC xətası: " + error.message, type: "status-error" })
    }
  }

  const fetchDashboardData = async (uid) => {
    try {
      const profRes = await fetch(`/profile/${uid}`)
      if (!profRes.ok) throw new Error("Profil tapılmadı")
      const profData = await profRes.json()
      
      const histRes = await fetch(`/history/${uid}`)
      const histData = await histRes.json()
      
      setProfile(profData)
      setHistory(histData)
      setStatus({ msg: "", type: "" })
    } catch (error) {
      setStatus({ msg: "Xəta: " + error.message, type: "status-error" })
      setProfile(null)
    }
  }

  if (!profile) {
    return (
      <div className="glass-card">
        <h2>İstifadəçi Paneli</h2>
        <div className="pulse-circle" style={{ position: 'relative', top: '0', left: '0', transform: 'none', margin: '0 auto 30px' }}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
            </svg>
        </div>
        <button className="btn-primary" onClick={handleScan}>Giriş (Qolbağı Oxut)</button>
        {status.msg && <div className={`status-msg ${status.type}`}>{status.msg}</div>}
      </div>
    )
  }

  return (
    <div className="glass-card" style={{ maxWidth: '600px' }}>
      <h2 style={{ marginBottom: '10px' }}>Xoş gəldin, {profile.name}!</h2>
      <div style={{ color: '#00e676', fontWeight: 'bold', marginBottom: '20px' }}>Stiker ID: {profile.nfc_uid}</div>
      
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px' }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '5px' }}>Real Bank Balansı</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{profile.bank_balance.toFixed(2)} AZN</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '5px' }}>{profile.bank_account}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(0,230,118,0.1)', border: '1px solid rgba(0,230,118,0.3)', padding: '20px', borderRadius: '16px' }}>
              <div style={{ fontSize: '12px', color: '#00e676', marginBottom: '5px' }}>Bilezik (Xərclənə bilən)</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#00e676' }}>{profile.wallet_balance.toFixed(2)} AZN</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '5px' }}>Gündəlik Limitiniz</div>
          </div>
      </div>

      <h3 style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', marginBottom: '15px' }}>Bu günün əməliyyatları</h3>
      
      {history.length === 0 ? (
          <div style={{ padding: '20px', color: 'rgba(255,255,255,0.5)' }}>Hələ heç bir əməliyyat yoxdur.</div>
      ) : (
          <div style={{ textAlign: 'left' }}>
              {history.map(tx => (
                  <div key={tx.id} style={{ 
                      background: 'rgba(255,255,255,0.05)', 
                      padding: '15px', 
                      borderRadius: '12px',
                      marginBottom: '10px',
                      borderLeft: tx.status === 'completed' ? '4px solid #00e676' : '4px solid #fbc02d'
                  }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontWeight: 'bold' }}>{tx.vendor_name}</span>
                          <span style={{ fontWeight: 'bold', color: tx.status === 'completed' ? '#00e676' : '#fbc02d' }}>{tx.amount} AZN</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                          <span>{new Date(tx.timestamp).toLocaleString('az-AZ')}</span>
                          <span>{tx.status === 'completed' ? 'Bankdan çıxılıb' : 'Gün sonunu gözləyir'}</span>
                      </div>
                  </div>
              ))}
          </div>
      )}
      
      <button className="btn-primary" style={{ marginTop: '30px', background: 'rgba(255,255,255,0.1)', color: 'white', boxShadow: 'none' }} onClick={() => setProfile(null)}>Çıxış</button>
    </div>
  )
}
