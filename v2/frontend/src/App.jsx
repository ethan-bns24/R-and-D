import { useEffect, useMemo, useState } from 'react'
import {
  assignGrant,
  fetchDoors,
  fetchEvents,
  fetchGrants,
  loginStaff,
  revokeGrant,
  setToken,
} from './api'

function toUnix(datetimeLocal) {
  if (!datetimeLocal) return 0
  return Math.floor(new Date(datetimeLocal).getTime() / 1000)
}

function fmtTs(ts) {
  if (!ts) return '-'
  return new Date(ts * 1000).toLocaleString()
}

export default function App() {
  const [token, setTokenState] = useState(localStorage.getItem('staff_token') || '')
  const [email, setEmail] = useState('staff@example.com')
  const [password, setPassword] = useState('staff123')
  const [error, setError] = useState('')

  const [doors, setDoors] = useState([])
  const [events, setEvents] = useState([])
  const [grants, setGrants] = useState([])

  const [assignForm, setAssignForm] = useState({
    user_email: 'guest@example.com',
    room_id: '101',
    from_local: new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 16),
    to_local: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  })

  useEffect(() => {
    setToken(token)
  }, [token])

  async function refreshAll() {
    const [d, e, g] = await Promise.all([fetchDoors(), fetchEvents(), fetchGrants()])
    setDoors(d)
    setEvents(e)
    setGrants(g)
  }

  useEffect(() => {
    if (!token) return
    let alive = true

    const run = async () => {
      try {
        await refreshAll()
      } catch (err) {
        if (alive) setError(err?.response?.data?.detail || 'Erreur API')
      }
    }

    run()
    const timer = setInterval(run, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [token])

  const connectedCount = useMemo(() => doors.filter((d) => d.connected).length, [doors])

  async function onLogin(e) {
    e.preventDefault()
    setError('')
    try {
      const data = await loginStaff(email, password)
      localStorage.setItem('staff_token', data.access_token)
      setTokenState(data.access_token)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Login impossible')
    }
  }

  function logout() {
    localStorage.removeItem('staff_token')
    setTokenState('')
    setDoors([])
    setEvents([])
    setGrants([])
  }

  async function onAssign(e) {
    e.preventDefault()
    setError('')
    try {
      await assignGrant({
        user_email: assignForm.user_email,
        room_id: assignForm.room_id,
        from_ts: toUnix(assignForm.from_local),
        to_ts: toUnix(assignForm.to_local),
      })
      await refreshAll()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Assign impossible')
    }
  }

  async function onRevoke(grantId) {
    setError('')
    try {
      await revokeGrant(grantId)
      await refreshAll()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Revoke impossible')
    }
  }

  if (!token) {
    return (
      <div className="container">
        <div className="card" style={{ maxWidth: 420, margin: '10vh auto' }}>
          <h1>Backoffice Hotel V2</h1>
          <p className="muted">Connexion staff pour gerer les acces et voir les portes connectees en websocket.</p>
          <form onSubmit={onLogin}>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
            <label>Mot de passe</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="row" style={{ marginTop: 14 }}>
              <button type="submit">Se connecter</button>
            </div>
          </form>
          {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="container grid" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Backoffice Hotel Access V2</h1>
        <button className="secondary" onClick={logout}>Deconnexion</button>
      </div>

      <div className="card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{connectedCount}</strong> / {doors.length} portes connectees
        </div>
        <div className="muted">Mise a jour automatique toutes les 3 secondes</div>
      </div>

      {error ? <div className="card" style={{ color: '#b91c1c' }}>{error}</div> : null}

      <div className="grid two">
        <div className="card">
          <h3>Porte et chambres</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Door</th>
                <th>WebSocket</th>
                <th>FW</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {doors.map((d) => (
                <tr key={d.door_id}>
                  <td>{d.room_label}</td>
                  <td>{d.door_id.slice(0, 8)}...</td>
                  <td>
                    <span className={`badge ${d.connected ? 'ok' : 'ko'}`}>
                      {d.connected ? 'connected' : 'offline'}
                    </span>
                  </td>
                  <td>{d.fw_version}</td>
                  <td>{fmtTs(d.last_seen_ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Attribuer un acces</h3>
          <form onSubmit={onAssign}>
            <label>Email client</label>
            <input
              value={assignForm.user_email}
              onChange={(e) => setAssignForm({ ...assignForm, user_email: e.target.value })}
            />
            <label>Room ID</label>
            <input
              value={assignForm.room_id}
              onChange={(e) => setAssignForm({ ...assignForm, room_id: e.target.value })}
            />
            <label>Debut</label>
            <input
              type="datetime-local"
              value={assignForm.from_local}
              onChange={(e) => setAssignForm({ ...assignForm, from_local: e.target.value })}
            />
            <label>Fin</label>
            <input
              type="datetime-local"
              value={assignForm.to_local}
              onChange={(e) => setAssignForm({ ...assignForm, to_local: e.target.value })}
            />
            <div className="row" style={{ marginTop: 12 }}>
              <button type="submit">Assigner</button>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <h3>Grants</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Grant</th>
              <th>User</th>
              <th>Room</th>
              <th>Door</th>
              <th>Validite</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((g) => (
              <tr key={`${g.grant_id}-${g.door_id}`}>
                <td>{g.grant_id.slice(0, 8)}...</td>
                <td>{g.user_email}</td>
                <td>{g.room_id}</td>
                <td>{g.door_id.slice(0, 8)}...</td>
                <td>{fmtTs(g.from_ts)} -> {fmtTs(g.to_ts)}</td>
                <td>{g.status}</td>
                <td>
                  <button
                    disabled={g.status !== 'active'}
                    onClick={() => onRevoke(g.grant_id)}
                  >
                    Revoquer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Access events</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Door</th>
              <th>Result</th>
              <th>Error</th>
              <th>Key</th>
              <th>Grant</th>
              <th>Meta</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.event_id}>
                <td>{fmtTs(ev.ts)}</td>
                <td>{ev.door_id.slice(0, 8)}...</td>
                <td>{ev.result}</td>
                <td>{ev.error_code}</td>
                <td>{ev.key_id.slice(0, 8)}...</td>
                <td>{ev.grant_id.slice(0, 8)}...</td>
                <td>{JSON.stringify(ev.meta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

