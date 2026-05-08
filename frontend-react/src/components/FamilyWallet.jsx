import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../api'

/* ─── tiny icon components ─────────────────────────────────────────────────── */
const IconFamily  = () => <span style={{fontSize:20}}>👨‍👩‍👧‍👦</span>
const IconChild   = () => <span style={{fontSize:18}}>🧒</span>
const IconRefresh = () => <span style={{fontSize:16}}>🔄</span>
const IconAdd     = () => <span style={{fontSize:16}}>＋</span>
const IconShield  = () => <span style={{fontSize:14}}>🛡</span>

/* ─── progress bar ──────────────────────────────────────────────────────────── */
function SpendBar({ spent, limit }) {
  const pct = Math.min((spent / limit) * 100, 100)
  const color = pct >= 90 ? '#d93025' : pct >= 70 ? '#f29900' : '#188038'
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 4 }}>
        <span>Spent: <strong>{spent.toFixed(2)} AZN</strong></span>
        <span>Limit: <strong>{limit.toFixed(2)} AZN</strong></span>
      </div>
      <div style={{ background: 'rgba(41,114,136,0.1)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ fontSize: 11, color, marginTop: 3, textAlign: 'right', fontWeight: 600 }}>
        {(limit - spent).toFixed(2)} AZN remaining today
      </div>
    </div>
  )
}

/* ─── child card ─────────────────────────────────────────────────────────────── */
function ChildCard({ child }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg,#fff,#f0f7fb)',
      border: '1px solid rgba(41,114,136,0.15)',
      borderRadius: 14, padding: '16px 18px', marginBottom: 12
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'linear-gradient(135deg,#297288,#1e5566)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 16, fontWeight: 700, flexShrink: 0
          }}>
            {child.child_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>{child.child_name}</div>
            <div style={{ fontSize: 12, color: '#666' }}>Age {child.age} &nbsp;·&nbsp;
              <code style={{ fontSize: 11, background: 'rgba(41,114,136,0.08)', padding: '1px 5px', borderRadius: 4 }}>
                {child.nfc_uid?.toUpperCase()}
              </code>
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: child.age < 18 ? 'rgba(217,48,37,0.08)' : 'rgba(24,128,56,0.08)',
          border: `1px solid ${child.age < 18 ? 'rgba(217,48,37,0.2)' : 'rgba(24,128,56,0.2)'}`,
          borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600,
          color: child.age < 18 ? '#d93025' : '#188038'
        }}>
          <IconShield /> {child.age < 18 ? 'Minor' : 'Adult'}
        </div>
      </div>
      <SpendBar spent={child.current_daily_spend} limit={child.daily_spending_limit} />
    </div>
  )
}

/* ─── main component ─────────────────────────────────────────────────────────── */
export default function FamilyWallet({ nfcUid }) {
  const [familyData,  setFamilyData]  = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [view,        setView]        = useState('info') // 'info' | 'create' | 'add_child'

  // create-family form
  const [famName,     setFamName]     = useState('')
  // add-child form
  const [childUid,    setChildUid]    = useState('')
  const [childName,   setChildName]   = useState('')
  const [childAge,    setChildAge]    = useState('')
  const [childLimit,  setChildLimit]  = useState('20')
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState({ text: '', ok: true })

  const fetchFamily = useCallback(async () => {
    if (!nfcUid) return
    setLoading(true); setError('')
    try {
      const res  = await fetch(`${API_BASE}/family/info/${nfcUid}`)
      if (res.status === 404) { setFamilyData(null); setError('no_family') }
      else if (!res.ok)       { setError('fetch_error') }
      else                    { setFamilyData(await res.json()) }
    } catch { setError('fetch_error') }
    finally  { setLoading(false) }
  }, [nfcUid])

  useEffect(() => { fetchFamily() }, [fetchFamily])

  /* create family account */
  const handleCreate = async () => {
    if (!famName.trim()) { setMsg({ text: 'Enter a family name.', ok: false }); return }
    setSaving(true); setMsg({ text: '', ok: true })
    try {
      const res  = await fetch(`${API_BASE}/family/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ master_nfc_uid: nfcUid, family_name: famName.trim() })
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ text: data.detail || 'Error', ok: false }) }
      else { setMsg({ text: `✓ Family "${data.family_name}" created!`, ok: true }); fetchFamily(); setView('info') }
    } catch { setMsg({ text: 'Network error.', ok: false }) }
    finally  { setSaving(false) }
  }

  /* add child */
  const handleAddChild = async () => {
    if (!childUid.trim() || !childName.trim() || !childAge) {
      setMsg({ text: 'Fill in all fields.', ok: false }); return
    }
    setSaving(true); setMsg({ text: '', ok: true })
    try {
      const res  = await fetch(`${API_BASE}/family/add_child`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          master_nfc_uid: nfcUid,
          child_nfc_uid: childUid.trim().toLowerCase(),
          child_name: childName.trim(),
          age: parseInt(childAge),
          daily_spending_limit: parseFloat(childLimit) || 20
        })
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ text: data.detail || 'Error', ok: false }) }
      else {
        setMsg({ text: `✓ ${data.child_name} added to ${data.family_name}!`, ok: true })
        setChildUid(''); setChildName(''); setChildAge(''); setChildLimit('20')
        fetchFamily(); setView('info')
      }
    } catch { setMsg({ text: 'Network error.', ok: false }) }
    finally  { setSaving(false) }
  }

  /* ── Card shell ─────────────────────────────────────────────────────────── */
  const cardStyle = {
    background: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(41,114,136,0.15)',
    borderRadius: 18, padding: '20px 20px',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
    marginBottom: 16
  }

  const btnPrimary = {
    background: '#297288', color: '#fff', border: 'none',
    borderRadius: 10, padding: '13px 20px', fontSize: 14,
    fontWeight: 700, cursor: 'pointer', width: '100%',
    fontFamily: 'Inter, sans-serif', transition: 'all 0.2s'
  }
  const btnOutline = {
    background: 'transparent', color: '#297288',
    border: '1.5px solid #297288', borderRadius: 10,
    padding: '11px 20px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif'
  }
  const inputStyle = {
    width: '100%', padding: '13px 14px', fontSize: 14,
    border: '1.5px solid rgba(41,114,136,0.2)', borderRadius: 10,
    fontFamily: 'Inter, sans-serif', background: 'rgba(255,255,255,0.9)',
    outline: 'none', boxSizing: 'border-box', marginBottom: 10
  }
  const labelStyle = { fontSize: 11, fontWeight: 700, color: '#297288',
    textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 5 }

  /* ─── Section header ─────────────────────────────────────────────────────── */
  const SectionHeader = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconFamily />
        <span style={{ fontFamily: 'Playfair Display, serif', fontSize: 20, fontWeight: 700, color: '#297288' }}>
          Family Wallet
        </span>
      </div>
      {familyData && (
        <button onClick={fetchFamily} style={{ ...btnOutline, padding: '6px 12px' }}>
          <IconRefresh /> Refresh
        </button>
      )}
    </div>
  )

  /* ── Loading ────────────────────────────────────────────────────────────── */
  if (loading) return (
    <div style={cardStyle}>
      <SectionHeader />
      <div style={{ textAlign: 'center', color: '#297288', padding: 20, fontSize: 14 }}>Loading family data…</div>
    </div>
  )

  /* ── No family yet ─────────────────────────────────────────────────────── */
  if (error === 'no_family' && view === 'info') return (
    <div style={cardStyle}>
      <SectionHeader />
      <div style={{ textAlign: 'center', padding: '10px 0 18px' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>👨‍👩‍👧</div>
        <div style={{ fontSize: 14, color: '#666', marginBottom: 18, lineHeight: 1.5 }}>
          No family account yet.<br/>Create one to link children's wristbands with spending limits.
        </div>
        <button style={btnPrimary} onClick={() => { setView('create'); setMsg({ text: '', ok: true }) }}>
          <IconAdd /> Create Family Account
        </button>
      </div>
    </div>
  )

  /* ── Create family form ─────────────────────────────────────────────────── */
  if (view === 'create') return (
    <div style={cardStyle}>
      <SectionHeader />
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Family Name</label>
        <input style={inputStyle} placeholder="e.g. Mammadov Family"
          value={famName} onChange={e => setFamName(e.target.value)} />
      </div>
      {msg.text && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600,
          background: msg.ok ? 'rgba(24,128,56,0.1)' : 'rgba(217,48,37,0.1)',
          color: msg.ok ? '#188038' : '#d93025' }}>{msg.text}</div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ ...btnOutline, flex: 1 }} onClick={() => setView('info')}>Cancel</button>
        <button style={{ ...btnPrimary, flex: 2 }} onClick={handleCreate} disabled={saving}>
          {saving ? 'Creating…' : 'Create Family'}
        </button>
      </div>
    </div>
  )

  /* ── Add child form ──────────────────────────────────────────────────────── */
  if (view === 'add_child') return (
    <div style={cardStyle}>
      <SectionHeader />
      <div style={{ fontSize: 13, color: '#666', marginBottom: 14, background: 'rgba(41,114,136,0.07)',
        borderRadius: 10, padding: '10px 14px' }}>
        ⚠️ The child's wristband must be registered first via <strong>Sign Up</strong> with balance = 0.
      </div>
      <label style={labelStyle}>Child Wristband ID</label>
      <input style={inputStyle} placeholder="e.g. CH-IL-D0-01"
        value={childUid} onChange={e => setChildUid(e.target.value)} />

      <label style={labelStyle}>Child's Name</label>
      <input style={inputStyle} placeholder="e.g. Ali"
        value={childName} onChange={e => setChildName(e.target.value)} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Age</label>
          <input style={inputStyle} type="number" placeholder="e.g. 10" min={0} max={120}
            value={childAge} onChange={e => setChildAge(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Daily Limit (AZN)</label>
          <input style={inputStyle} type="number" placeholder="20" min={0}
            value={childLimit} onChange={e => setChildLimit(e.target.value)} />
        </div>
      </div>

      {msg.text && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600,
          background: msg.ok ? 'rgba(24,128,56,0.1)' : 'rgba(217,48,37,0.1)',
          color: msg.ok ? '#188038' : '#d93025' }}>{msg.text}</div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ ...btnOutline, flex: 1 }} onClick={() => setView('info')}>Cancel</button>
        <button style={{ ...btnPrimary, flex: 2 }} onClick={handleAddChild} disabled={saving}>
          {saving ? 'Adding…' : 'Add Child'}
        </button>
      </div>
    </div>
  )

  /* ── Family dashboard ────────────────────────────────────────────────────── */
  if (familyData) return (
    <div style={cardStyle}>
      <SectionHeader />

      {/* Family name + master balance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'linear-gradient(135deg,#297288,#1e5566)', borderRadius: 12,
        padding: '14px 18px', marginBottom: 16, color: '#fff' }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75, letterSpacing: 1, textTransform: 'uppercase' }}>Family</div>
          <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, fontWeight: 700 }}>
            {familyData.family_name}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, opacity: 0.75 }}>Shared Balance</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Playfair Display,serif' }}>
            {familyData.master_balance?.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>AZN</div>
        </div>
      </div>

      {/* Children */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#297288', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconChild /> Children ({familyData.children.length})
        </div>
        <button style={{ ...btnOutline, padding: '6px 14px', fontSize: 12 }}
          onClick={() => { setView('add_child'); setMsg({ text: '', ok: true }) }}>
          <IconAdd /> Add Child
        </button>
      </div>

      {familyData.children.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#999', fontSize: 13 }}>
          No children linked yet. Tap "Add Child" to get started.
        </div>
      ) : (
        familyData.children.map((child, i) => <ChildCard key={i} child={child} />)
      )}

      {msg.text && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginTop: 8, fontSize: 13, fontWeight: 600,
          background: msg.ok ? 'rgba(24,128,56,0.1)' : 'rgba(217,48,37,0.1)',
          color: msg.ok ? '#188038' : '#d93025' }}>{msg.text}</div>
      )}
    </div>
  )

  return null
}
