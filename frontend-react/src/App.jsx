import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import UserDashboard from './components/UserDashboard'
import Admin from './components/Admin'
import Register from './components/Register'
import { API_BASE } from './api'

function ProfileModal({ uid, onClose, onProfileUpdated }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBank, setEditBank] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState({ text: '', ok: true });

  // Password change state
  const [pwMode, setPwMode]     = useState(false);
  const [curPw, setCurPw]       = useState('');
  const [newPw, setNewPw]       = useState('');
  const [confPw, setConfPw]     = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg]       = useState({ text: '', ok: true });

  useEffect(() => {
    fetch(`${API_BASE}/profile/${uid}`)
      .then(res => res.json())
      .then(data => {
        setProfile(data);
        setEditName(data.name);
        setEditBank(data.bank_account);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [uid]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg({ text: '', ok: true });
    try {
      const res = await fetch(`${API_BASE}/profile/${uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, bank_account: editBank }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Save failed');
      setProfile(prev => ({ ...prev, name: data.name, bank_account: data.bank_account }));
      setSaveMsg({ text: '✅ Profile updated!', ok: true });
      setEditMode(false);
      if (onProfileUpdated) onProfileUpdated(data.name);
    } catch (err) {
      setSaveMsg({ text: `❌ ${err.message}`, ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handlePwSave = async () => {
    if (!newPw.trim()) { setPwMsg({ text: 'New password cannot be empty.', ok: false }); return; }
    if (newPw !== confPw) { setPwMsg({ text: 'Passwords do not match.', ok: false }); return; }
    if (profile.has_password && !curPw.trim()) { setPwMsg({ text: 'Enter your current password.', ok: false }); return; }

    setPwSaving(true);
    setPwMsg({ text: '', ok: true });
    try {
      const res = await fetch(`${API_BASE}/set_password/${uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nfc_uid: uid,
          new_password: newPw.trim(),
          current_password: curPw.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to set password');
      setPwMsg({ text: '✅ ' + data.message, ok: true });
      setProfile(prev => ({ ...prev, has_password: true }));
      setCurPw(''); setNewPw(''); setConfPw('');
      setTimeout(() => setPwMode(false), 1500);
    } catch (err) {
      setPwMsg({ text: `❌ ${err.message}`, ok: false });
    } finally {
      setPwSaving(false);
    }
  };

  const teal = 'var(--text-secondary)';
  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4 };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: 1 };
  const valueStyle = { fontSize: 15, color: '#1a1a1a', fontWeight: 500 };
  const inputStyle = {
    width: '100%', padding: '10px 14px', fontSize: 14,
    border: '1px solid rgba(41,114,136,0.3)', borderRadius: 8,
    fontFamily: 'Inter, sans-serif', outline: 'none',
    background: 'rgba(41,114,136,0.04)'
  };

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onClick={e => e.stopPropagation()} style={{background:'white',padding:0,borderRadius:20,width:'90%',maxWidth:380,overflow:'hidden',boxShadow:'0 24px 60px rgba(0,0,0,0.15)',maxHeight:'90vh',overflowY:'auto'}}>

        {/* Header */}
        <div style={{background:'linear-gradient(135deg,#297288,#1a4f61)',padding:'20px 24px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{color:'white',fontFamily:'Playfair Display,serif',fontSize:18,fontWeight:700}}>My Profile</div>
            <div style={{color:'rgba(255,255,255,0.6)',fontSize:11,marginTop:2}}>NFC: {uid?.toUpperCase()}</div>
          </div>
          {!editMode && !pwMode && <button onClick={() => { setEditMode(true); setSaveMsg({ text:'',ok:true }); }} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'white',borderRadius:8,padding:'6px 14px',fontSize:12,fontWeight:600,cursor:'pointer'}}>Edit</button>}
        </div>

        {/* Body */}
        <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:16}}>
          {loading ? <p style={{color:'#666',textAlign:'center'}}>Loading…</p> : !profile ? <p style={{color:'#d93025'}}>Error loading profile.</p> : (
            <>
              {/* Name */}
              <div style={fieldStyle}>
                <div style={labelStyle}>Display Name</div>
                {editMode
                  ? <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Your name" />
                  : <div style={valueStyle}>{profile.name}</div>}
              </div>

              {/* Bank Account */}
              <div style={fieldStyle}>
                <div style={labelStyle}>Bank Account Number</div>
                {editMode
                  ? <input style={inputStyle} value={editBank} onChange={e => setEditBank(e.target.value)} placeholder="e.g. AZ12 0000 1234 5678" />
                  : <div style={{...valueStyle, fontFamily:'monospace', fontSize:13}}>{profile.bank_account}</div>}
              </div>

              {/* Admin badge */}
              {profile.is_admin && (
                <div style={{background:'rgba(41,114,136,0.08)',borderRadius:8,padding:'8px 12px',fontSize:12,color:teal,fontWeight:600}}>
                  ⚡ Admin User
                </div>
              )}

              {/* Save message (for profile edit) */}
              {saveMsg.text && (
                <div style={{fontSize:13,fontWeight:600,color:saveMsg.ok?'#188038':'#d93025',background:saveMsg.ok?'rgba(24,128,56,0.08)':'rgba(217,48,37,0.08)',borderRadius:8,padding:'8px 12px'}}>
                  {saveMsg.text}
                </div>
              )}

              {/* ── Password Section ── */}
              {!editMode && (
                <div style={{borderTop:'1px solid rgba(41,114,136,0.1)',paddingTop:16}}>
                  {!pwMode ? (
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div>
                        <div style={labelStyle}>Wristband Password</div>
                        <div style={{fontSize:13,color:'#666',marginTop:4}}>
                          {profile.has_password ? '🔒 Password is set' : '🔓 No password — anyone can use this band'}
                        </div>
                      </div>
                      <button onClick={() => { setPwMode(true); setPwMsg({text:'',ok:true}); setCurPw(''); setNewPw(''); setConfPw(''); }}
                        style={{background:'rgba(41,114,136,0.08)',border:'none',borderRadius:8,padding:'8px 14px',fontSize:12,fontWeight:600,color:teal,cursor:'pointer',whiteSpace:'nowrap'}}>
                        {profile.has_password ? 'Change' : 'Set Password'}
                      </button>
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      <div style={{...labelStyle, fontSize:12}}>🔑 {profile.has_password ? 'Change Password' : 'Set a Password'}</div>

                      {profile.has_password && (
                        <div style={fieldStyle}>
                          <div style={{...labelStyle, fontSize:10}}>Current Password</div>
                          <input type="password" style={inputStyle} value={curPw} onChange={e => setCurPw(e.target.value)} placeholder="Enter current password" />
                        </div>
                      )}

                      <div style={fieldStyle}>
                        <div style={{...labelStyle, fontSize:10}}>New Password</div>
                        <input type="password" style={inputStyle} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Enter new password" />
                      </div>

                      <div style={fieldStyle}>
                        <div style={{...labelStyle, fontSize:10}}>Confirm New Password</div>
                        <input type="password" style={inputStyle} value={confPw} onChange={e => setConfPw(e.target.value)} placeholder="Re-enter new password"
                          onKeyDown={e => e.key === 'Enter' && handlePwSave()} />
                      </div>

                      {pwMsg.text && (
                        <div style={{fontSize:12,fontWeight:600,color:pwMsg.ok?'#188038':'#d93025',background:pwMsg.ok?'rgba(24,128,56,0.08)':'rgba(217,48,37,0.08)',borderRadius:8,padding:'8px 12px'}}>
                          {pwMsg.text}
                        </div>
                      )}

                      <div style={{display:'flex',gap:8}}>
                        <button onClick={() => setPwMode(false)}
                          style={{flex:1,padding:'10px',border:'1px solid rgba(41,114,136,0.3)',borderRadius:8,background:'white',color:'#666',fontSize:13,cursor:'pointer',fontFamily:'Inter,sans-serif'}}>
                          Cancel
                        </button>
                        <button onClick={handlePwSave} disabled={pwSaving}
                          style={{flex:2,padding:'10px',border:'none',borderRadius:8,background:'linear-gradient(135deg,#297288,#1a4f61)',color:'white',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'Inter,sans-serif',opacity:pwSaving?0.7:1}}>
                          {pwSaving ? 'Saving…' : 'Save Password'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{padding:'0 24px 20px',display:'flex',gap:8}}>
          {editMode ? (
            <>
              <button onClick={() => { setEditMode(false); setEditName(profile?.name||''); setEditBank(profile?.bank_account||''); setSaveMsg({text:'',ok:true}); }}
                style={{flex:1,padding:'12px',border:'1px solid rgba(41,114,136,0.3)',borderRadius:10,background:'white',color:'#666',fontFamily:'Inter,sans-serif',fontSize:14,cursor:'pointer'}}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{flex:2,padding:'12px',border:'none',borderRadius:10,background:'linear-gradient(135deg,#297288,#1a4f61)',color:'white',fontFamily:'Inter,sans-serif',fontSize:14,fontWeight:600,cursor:'pointer',opacity:saving?0.7:1}}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button onClick={onClose}
              style={{flex:1,padding:'12px',border:'none',borderRadius:10,background:'linear-gradient(135deg,#297288,#1a4f61)',color:'white',fontFamily:'Inter,sans-serif',fontSize:14,fontWeight:600,cursor:'pointer'}}>
              Close
            </button>
          )}
        </div>
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
        <Route path="/dashboard" element={<UserDashboard setIsAdmin={setIsAdmin} setUid={setUid} uid={uid} />} />
        <Route path="/admin" element={isAdmin ? <Admin adminUid={uid} /> : <Navigate to="/dashboard" replace />} />
        <Route path="/register" element={<Register adminUid={uid} />} />
      </Routes>

      {profileModalOpen && <ProfileModal uid={uid} onClose={() => setProfileModalOpen(false)} />}
      {notifModalOpen && <NotifModal onClose={() => setNotifModalOpen(false)} />}
    </div>
  )
}

export default App
