import { useState, useEffect } from 'react'
import { API_BASE } from '../api'

export default function Admin() {
  const [users, setUsers] = useState([])
  const [status, setStatus] = useState({ msg: 'Məlumatlar yüklənir...', type: 'status-waiting' })
  const [isProcessing, setIsProcessing] = useState(false)

  const fetchDb = async () => {
      try {
          const res = await fetch(`${API_BASE}/database_view`)
          if (res.ok) {
              const data = await res.json()
              setUsers(data)
              setStatus({msg: '', type: ''})
          }
      } catch (err) {
          setStatus({msg: 'Baza ilə əlaqə kəsildi', type: 'status-error'})
      }
  }

  useEffect(() => {
      fetchDb()
  }, [])

  const handleSettle = async () => {
    setIsProcessing(true)
    setStatus({ msg: "Hesablaşma aparılır... Gözləyin", type: "status-waiting" })
    
    try {
      const response = await fetch(`${API_BASE}/settle_day`, { method: 'POST' })
      const data = await response.json()
      
      if (response.ok) {
        setStatus({ msg: `Uğurlu! ${data.message} Çəkilən məbləğ: ${data.total_settled} AZN`, type: "status-success" })
        fetchDb() // Update table
      } else {
        setStatus({ msg: `Xəta: ${data.detail}`, type: "status-error" })
      }
    } catch (error) {
      setStatus({ msg: "Serverə qoşulmaq alınmadı.", type: "status-error" })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="glass-card" style={{ maxWidth: '800px', width: '100%' }}>
      <h2>Admin / Baza Paneli</h2>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, textAlign: 'left', maxWidth: '60%' }}>
            Sistem avtomatik olaraq hər 2 dəqiqədən bir gün sonunu edir. Ancaq istəsəniz, aşağıdakı düymə ilə manual da edə bilərsiniz.
          </p>
          <button 
            className="btn-primary" 
            onClick={handleSettle}
            disabled={isProcessing}
            style={{ 
                margin: 0,
                width: 'auto',
                padding: '12px 24px',
                background: isProcessing ? 'gray' : 'linear-gradient(135deg, #fbc02d, #f57f17)',
                boxShadow: isProcessing ? 'none' : '0 10px 20px rgba(245, 127, 23, 0.3)'
            }}
          >
            {isProcessing ? 'Gözləyin...' : 'Manual Hesablaşma'}
          </button>
      </div>

      {status.msg && <div className={`status-msg ${status.type}`}>{status.msg}</div>}

      <div style={{ overflowX: 'auto', marginTop: '30px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', overflow: 'hidden' }}>
              <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.1)' }}>
                      <th style={{ padding: '15px' }}>Ad</th>
                      <th style={{ padding: '15px' }}>NFC ID</th>
                      <th style={{ padding: '15px' }}>Qolbaq Balansı</th>
                      <th style={{ padding: '15px' }}>Bank Kartı</th>
                      <th style={{ padding: '15px' }}>Real Bank Balansı</th>
                  </tr>
              </thead>
              <tbody>
                  {users.map(u => (
                      <tr key={u.user_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '15px', fontWeight: 'bold' }}>{u.name}</td>
                          <td style={{ padding: '15px', color: '#b3e5fc' }}>{u.nfc_uid}</td>
                          <td style={{ padding: '15px', color: '#00e676', fontWeight: 'bold' }}>{u.wallet_balance} AZN</td>
                          <td style={{ padding: '15px', fontSize: '12px' }}>{u.bank_account}</td>
                          <td style={{ padding: '15px', fontWeight: 'bold' }}>{u.bank_balance} AZN</td>
                      </tr>
                  ))}
              </tbody>
          </table>
      </div>
      
    </div>
  )
}
