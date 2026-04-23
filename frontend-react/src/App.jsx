import { Routes, Route, NavLink } from 'react-router-dom'
import PosTerminal from './components/PosTerminal'
import Registration from './components/Registration'
import UserDashboard from './components/UserDashboard'
import Admin from './components/Admin'

function App() {
  return (
    <div className="app-container">
      <nav className="nav-bar">
        <NavLink to="/" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>POS Terminal</NavLink>
        <NavLink to="/register" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Qeydiyyat</NavLink>
        <NavLink to="/dashboard" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Dashboard</NavLink>
        <NavLink to="/admin" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>Admin</NavLink>
      </nav>
      
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
