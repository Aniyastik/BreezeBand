import { Routes, Route, NavLink } from 'react-router-dom'
import PosTerminal from './components/PosTerminal'
import Registration from './components/Registration'
import UserDashboard from './components/UserDashboard'
import Admin from './components/Admin'
import { API_BASE, setBackendUrl } from './api'
import { useState, useEffect } from 'react'

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState(API_BASE);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Check if backend is reachable
    fetch(`${API_BASE}/db-status`)
      .then(res => setIsOnline(res.ok))
      .catch(() => setIsOnline(false));
  }, []);

  return (
    <div className="app-container">
      <nav className="nav-bar">
        <NavLink to="/" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>POS Terminal</NavLink>
        <NavLink to="/register" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Qeydiyyat</NavLink>
        <NavLink to="/dashboard" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Dashboard</NavLink>
        <NavLink to="/admin" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Admin</NavLink>
        
        <div className="connection-status" onClick={() => setShowSettings(true)} style={{ 
          marginLeft: 'auto', 
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 12px',
          borderRadius: '20px',
          background: isOnline ? 'rgba(0,230,118,0.1)' : 'rgba(255,82,82,0.1)',
          color: isOnline ? '#00e676' : '#ff5252',
          fontSize: '12px'
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor' }}></span>
          {isOnline ? 'Onlayn' : 'Oflayn (Ayarlar)'}
        </div>
      </nav>

      {showSettings && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(10px)'
        }}>
          <div className="glass-card" style={{ maxWidth: '400px', width: '90%' }}>
            <h3>Bağlantı Ayarları</h3>
            <p style={{ fontSize: '12px', opacity: 0.7, marginBottom: '20px' }}>
              Əgər bulud servisindən (Vercel) istifadə edirsinizsə, backend URL-i daxil edin.
            </p>
            <div className="input-group">
              <label>Backend URL</label>
              <input 
                type="text" 
                value={tempUrl} 
                onChange={(e) => setTempUrl(e.target.value)}
                placeholder="http://192.168.1.XX:8000"
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn-primary" onClick={() => setBackendUrl(tempUrl)} style={{ flex: 1 }}>Yadda Saxla</button>
              <button className="btn-primary" onClick={() => setShowSettings(false)} style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }}>Ləğv Et</button>
            </div>
          </div>
        </div>
      )}
      
      <Routes>
        <Route path="/" element={<PosTerminal />} />
        <Route path="/register" element={<Registration />} />
        <Route path="/dashboard" element={<UserDashboard />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </div>
  )
}

export default App
