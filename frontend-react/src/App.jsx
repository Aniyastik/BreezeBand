import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import UserDashboard from './components/UserDashboard'
import Admin from './components/Admin'

function App() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [uid, setUid] = useState(null)

  useEffect(() => {
    const storedUid = localStorage.getItem('userUid')
    const storedIsAdmin = localStorage.getItem('isAdmin') === 'true'
    if (storedUid) {
      setUid(storedUid)
      setIsAdmin(storedIsAdmin)
    }
  }, [])

  return (
    <div className="app-container">
      <nav className="nav-bar">
        <NavLink to="/dashboard" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Dashboard</NavLink>
        {isAdmin && <NavLink to="/admin" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Admin</NavLink>}
      </nav>
      
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<UserDashboard setIsAdmin={setIsAdmin} setUid={setUid} />} />
        <Route path="/admin" element={isAdmin ? <Admin adminUid={uid} /> : <Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  )
}

export default App
