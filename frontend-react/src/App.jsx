import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import UserDashboard from './components/UserDashboard'
import Admin from './components/Admin'
import Register from './components/Register'

function App() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [uid, setUid] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
            <button className="icon-btn">
              <UserIcon />
            </button>
            <button className="icon-btn">
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
          <NavLink to="/register" onClick={() => setSidebarOpen(false)}>Register User</NavLink>
          <button onClick={handleLogout} style={{color: '#ffb3b3'}}>Logout</button>
        </nav>

        <div style={{marginTop: 'auto', display: 'flex', justifyContent: 'center', gap: '16px', paddingBottom: '24px'}}>
            {/* Simple flag circles using CSS */}
            <div style={{width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(to bottom, #00b5e2 33%, #ed2939 33%, #ed2939 66%, #009b77 66%)', border: '2px solid white'}}></div>
            <div style={{width: 32, height: 32, borderRadius: '50%', background: '#00247d', position: 'relative', border: '2px solid white', overflow: 'hidden'}}>
               <div style={{position: 'absolute', top: 0, bottom: 0, left: '40%', right: '40%', background: '#cf142b'}}></div>
               <div style={{position: 'absolute', left: 0, right: 0, top: '40%', bottom: '40%', background: '#cf142b'}}></div>
            </div>
            <div style={{width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(to bottom, white 33%, #0033a0 33%, #0033a0 66%, #da291c 66%)', border: '2px solid white'}}></div>
        </div>
      </div>
      
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<UserDashboard setIsAdmin={setIsAdmin} setUid={setUid} />} />
        <Route path="/admin" element={isAdmin ? <Admin adminUid={uid} /> : <Navigate to="/dashboard" replace />} />
        <Route path="/register" element={<Register adminUid={uid} />} />
      </Routes>
    </div>
  )
}

export default App
