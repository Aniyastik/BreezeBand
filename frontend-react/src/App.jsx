import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import UserDashboard from './components/UserDashboard'
import Admin from './components/Admin'
import Register from './components/Register'
import { API_BASE } from './api'

function ProfileModal({ uid, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetch(`${API_BASE}/profile/${uid}`)
      .then(res => res.json())
      .then(data => { setProfile(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [uid]);

  return (
    <div className="modal-overlay" onClick={onClose} style={{position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{backgroundColor: 'var(--bg-panel)', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '350px'}}>
        <h3 style={{marginTop: 0}}>User Profile</h3>
        {loading ? <p>Loading...</p> : profile ? (
          <div style={{display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px'}}>
            <div><strong style={{color: 'var(--text-secondary)'}}>Name:</strong> {profile.name}</div>
            <div><strong style={{color: 'var(--text-secondary)'}}>Wristband ID:</strong> {profile.nfc_uid.toUpperCase()}</div>
            <div><strong style={{color: 'var(--text-secondary)'}}>Bank Account:</strong> {profile.bank_account}</div>
            {profile.is_admin && <div style={{color: 'var(--text-accent)'}}><strong>Admin User</strong></div>}
          </div>
        ) : <p>Error loading profile.</p>}
        <button className="btn-primary w-full" style={{marginTop: '24px'}} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function NotifModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{backgroundColor: 'var(--bg-panel)', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '350px'}}>
        <h3 style={{marginTop: 0}}>Notifications</h3>
        <p style={{color: 'var(--text-secondary)', fontSize: '14px', padding: '12px 0'}}>No new notifications at this time.</p>
        <button className="btn-primary w-full" style={{marginTop: '24px'}} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}


function App() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [uid, setUid] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [notifModalOpen, setNotifModalOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const storedUid = localStorage.getItem('userUid')
    const storedIsAdmin = localStorage.getItem('isAdmin') === 'true'
    if (storedUid) {
      setUid(storedUid)
      setIsAdmin(storedIsAdmin)
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('userUid')
    localStorage.removeItem('isAdmin')
    setUid(null)
    setIsAdmin(false)
    setSidebarOpen(false)
    navigate('/dashboard')
    // Trigger a small reload or state update in children if needed, 
    // but the routes will handle it since uid changes.
    window.location.reload();
  }

  // Icons
  const MenuIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
  )
  const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  )
  const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  )
  const BellIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
  )

  return (
    <div className="app-container">
      {/* Background wave for splash screens, visible when logged out */}
      {!uid && <div className="bg-wave-bottom"></div>}

      {/* Header, visible only when logged in */}
      {uid && (
        <header className="header-bar">
          <button className="icon-btn" onClick={() => setSidebarOpen(true)}>
            <MenuIcon />
          </button>
          
          <div className="header-logo">
            <div className="main">SEA BREEZE</div>
            <div className="sub">RESORT</div>
          </div>
          
          <div className="header-icons">
            <button className="icon-btn" onClick={() => setProfileModalOpen(true)}>
              <UserIcon />
            </button>
            <button className="icon-btn" onClick={() => setNotifModalOpen(true)}>
              <BellIcon />
            </button>
          </div>
        </header>
      )}

      {/* Sidebar Overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <CloseIcon />
          </button>
          <div className="sidebar-logo">
            <div className="main">SEA BREEZE</div>
            <div className="sub">RESORT</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" onClick={() => setSidebarOpen(false)}>Dashboard</NavLink>
          {isAdmin && <NavLink to="/admin" onClick={() => setSidebarOpen(false)}>Admin Panel</NavLink>}
          {isAdmin && <a href="/pos" target="_blank" rel="noopener noreferrer" onClick={() => setSidebarOpen(false)}>POS Terminal ↗</a>}
          <NavLink to="/register" onClick={() => setSidebarOpen(false)}>Register User</NavLink>
          <button onClick={handleLogout} style={{color: '#ffb3b3'}}>Logout</button>
        </nav>


      </div>
      
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<UserDashboard setIsAdmin={setIsAdmin} setUid={setUid} />} />
        <Route path="/admin" element={isAdmin ? <Admin adminUid={uid} /> : <Navigate to="/dashboard" replace />} />
        <Route path="/register" element={<Register adminUid={uid} />} />
      </Routes>

      {profileModalOpen && <ProfileModal uid={uid} onClose={() => setProfileModalOpen(false)} />}
      {notifModalOpen && <NotifModal onClose={() => setNotifModalOpen(false)} />}
    </div>
  )
}

export default App
