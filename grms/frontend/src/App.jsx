import { useEffect, useMemo, useRef, useState } from 'react'
import {
  assignGrant,
  createClient,
  createDoor,
  createStaffUser,
  deleteClient,
  deleteDoor,
  deleteStaffUser,
  fetchClients,
  fetchDoors,
  fetchEvents,
  fetchGrants,
  fetchRooms,
  fetchStaffUsers,
  loginStaff,
  pingBackend,
  revokeGrant,
  setToken,
  updateClient,
  updateDoor,
  updateStaffUser,
} from './api'
import HeaderBar from './components/layout/HeaderBar'
import LoginView from './components/layout/LoginView'
import ToastStack from './components/layout/ToastStack'
import AccessTab from './components/tabs/AccessTab'
import DashboardTab from './components/tabs/DashboardTab'
import DoorsTab from './components/tabs/DoorsTab'
import EventsTab from './components/tabs/EventsTab'
import UsersTab from './components/tabs/UsersTab'
import { parseApiError } from './utils/errors'
import { defaultRange, toUnix } from './utils/format'

export default function App() {
  const [token, setTokenState] = useState(localStorage.getItem('staff_token') || '')
  const [email, setEmail] = useState('staff@example.com')
  const [password, setPassword] = useState('staff123')
  const [tab, setTab] = useState('dashboard')
  const [authError, setAuthError] = useState('')
  const [ping, setPing] = useState({ ok: null, ms: null })
  const [toasts, setToasts] = useState([])
  const lock = useRef(false)
  const lastSyncToastTs = useRef(0)

  const [staff, setStaff] = useState([])
  const [clients, setClients] = useState([])
  const [rooms, setRooms] = useState([])
  const [doors, setDoors] = useState([])
  const [grants, setGrants] = useState([])
  const [events, setEvents] = useState([])

  const [staffForm, setStaffForm] = useState({ email: '', password: '', role: 'staff' })
  const [clientForm, setClientForm] = useState({ name: '', email: '', password: '' })
  const [doorForm, setDoorForm] = useState({ door_id: '', room_id: '', room_label: '', ble_id: '' })
  const [assignForm, setAssignForm] = useState({ user_email: 'guest@example.com', room_id: '101', ...defaultRange() })

  const [editStaff, setEditStaff] = useState(null)
  const [editClient, setEditClient] = useState(null)
  const [editDoor, setEditDoor] = useState(null)

  useEffect(() => setToken(token), [token])

  useEffect(() => {
    if (!clients.length || !rooms.length) return
    setAssignForm((value) => ({
      ...value,
      user_email: clients.some((x) => x.email === value.user_email) ? value.user_email : clients[0].email,
      room_id: rooms.some((x) => x.room_id === value.room_id) ? value.room_id : rooms[0].room_id,
    }))
  }, [clients, rooms])

  const notify = (kind, message) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((value) => [...value, { id, kind, message }])
    setTimeout(() => setToasts((value) => value.filter((item) => item.id !== id)), 2800)
  }

  const refresh = async () => {
    if (lock.current) return
    lock.current = true
    try {
      const [staffData, clientData, roomData, doorData, grantData, eventData] = await Promise.all([
        fetchStaffUsers(),
        fetchClients(),
        fetchRooms(),
        fetchDoors(),
        fetchGrants(),
        fetchEvents(),
      ])
      setStaff(staffData)
      setClients(clientData)
      setRooms(roomData)
      setDoors(doorData)
      setGrants(grantData)
      setEvents(eventData)
    } catch (err) {
      const now = Date.now()
      if (now - lastSyncToastTs.current > 20000) {
        notify('error', parseApiError(err, 'Erreur de synchronisation avec le backend'))
        lastSyncToastTs.current = now
      }
    } finally {
      lock.current = false
    }
  }

  const pingNow = async () => {
    const start = performance.now()
    try {
      await pingBackend()
      setPing({ ok: true, ms: Math.round(performance.now() - start) })
    } catch {
      setPing({ ok: false, ms: null })
    }
  }

  useEffect(() => {
    if (!token) return
    refresh()
    pingNow()
    const timer = setInterval(() => {
      refresh()
      pingNow()
    }, 5000)
    return () => clearInterval(timer)
  }, [token])

  const stats = useMemo(
    () => ({
      connected: doors.filter((item) => item.connected).length,
      totalDoors: doors.length,
      activeGrants: grants.filter((item) => item.status === 'active').length,
      success: events.filter((item) => item.result === 'success').length,
      fail: events.filter((item) => item.result === 'fail').length,
    }),
    [doors, grants, events],
  )

  const wrapAction = async (fn, failureMessage) => {
    try {
      await fn()
    } catch (err) {
      notify('error', parseApiError(err, failureMessage))
    }
  }

  const logout = () => {
    localStorage.removeItem('staff_token')
    setTokenState('')
    setStaff([]); setClients([]); setRooms([]); setDoors([]); setGrants([]); setEvents([])
  }

  const onLogin = async (e) => {
    e.preventDefault()
    setAuthError('')
    try {
      const data = await loginStaff(email, password)
      localStorage.setItem('staff_token', data.access_token)
      setTokenState(data.access_token)
      notify('success', 'Connexion reussie')
    } catch (err) {
      const message = parseApiError(err, 'Login impossible')
      setAuthError(message)
      notify('error', message)
    }
  }

  const onCreateStaff = (e) => wrapAction(async () => {
    e.preventDefault()
    await createStaffUser(staffForm); setStaffForm({ email: '', password: '', role: 'staff' }); await refresh(); notify('success', 'Staff ajoute')
  }, 'Creation staff impossible')
  const onUpdateStaff = (e) => wrapAction(async () => {
    e.preventDefault()
    await updateStaffUser(editStaff.staff_id, { email: editStaff.email, role: editStaff.role, password: editStaff.password || null })
    setEditStaff(null); await refresh(); notify('success', 'Staff modifie')
  }, 'Mise a jour staff impossible')
  const onDeleteStaff = (id) => wrapAction(async () => {
    if (!window.confirm('Supprimer ce staff ?')) return
    await deleteStaffUser(id); await refresh(); notify('success', 'Staff supprime')
  }, 'Suppression staff impossible')

  const onCreateClient = (e) => wrapAction(async () => {
    e.preventDefault()
    await createClient(clientForm); setClientForm({ name: '', email: '', password: '' }); await refresh(); notify('success', 'Client ajoute')
  }, 'Creation client impossible')
  const onUpdateClient = (e) => wrapAction(async () => {
    e.preventDefault()
    await updateClient(editClient.user_id, { name: editClient.name, email: editClient.email, password: editClient.password || null })
    setEditClient(null); await refresh(); notify('success', 'Client modifie')
  }, 'Mise a jour client impossible')
  const onDeleteClient = (id) => wrapAction(async () => {
    if (!window.confirm('Supprimer ce client ? Ses acces seront revoques.')) return
    await deleteClient(id); await refresh(); notify('success', 'Client supprime')
  }, 'Suppression client impossible')

  const onCreateDoor = (e) => wrapAction(async () => {
    e.preventDefault()
    await createDoor({ ...doorForm, room_label: doorForm.room_label || null }); setDoorForm({ door_id: '', room_id: '', room_label: '', ble_id: '' })
    await refresh(); notify('success', 'Porte ajoutee')
  }, 'Creation porte impossible')
  const onUpdateDoor = (e) => wrapAction(async () => {
    e.preventDefault()
    await updateDoor(editDoor.door_id, { room_id: editDoor.room_id, room_label: editDoor.room_label || null, ble_id: editDoor.ble_id || null })
    setEditDoor(null); await refresh(); notify('success', 'Porte modifiee')
  }, 'Mise a jour porte impossible')
  const onDeleteDoor = (id) => wrapAction(async () => {
    if (!window.confirm(`Supprimer la porte ${id} ?`)) return
    await deleteDoor(id); await refresh(); notify('success', 'Porte supprimee')
  }, 'Suppression porte impossible')

  const onAssign = (e) => wrapAction(async () => {
    e.preventDefault()
    await assignGrant({ user_email: assignForm.user_email, room_id: assignForm.room_id, from_ts: toUnix(assignForm.from_local), to_ts: toUnix(assignForm.to_local) })
    await refresh(); notify('success', 'Acces assigne')
  }, 'Assign impossible')
  const onRevoke = (id) => wrapAction(async () => {
    await revokeGrant(id); await refresh(); notify('success', 'Acces revoque')
  }, 'Revoke impossible')

  if (!token) {
    return <LoginView email={email} password={password} error={authError} onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={onLogin} />
  }

  return (
    <div className="container app-shell">
      <HeaderBar ping={ping} stats={stats} staffCount={staff.length} clientCount={clients.length} activeTab={tab} onTabChange={setTab} onRefresh={refresh} onLogout={logout} />
      {tab === 'dashboard' ? <DashboardTab doors={doors} events={events} /> : null}
      {tab === 'users' ? <UsersTab
        staff={staff} clients={clients} staffForm={staffForm} clientForm={clientForm} editStaff={editStaff} editClient={editClient}
        onStaffFormChange={setStaffForm} onClientFormChange={setClientForm} onEditStaffChange={setEditStaff} onEditClientChange={setEditClient}
        onCreateStaff={onCreateStaff} onUpdateStaff={onUpdateStaff} onDeleteStaff={onDeleteStaff} onCreateClient={onCreateClient}
        onUpdateClient={onUpdateClient} onDeleteClient={onDeleteClient} onCancelEditStaff={() => setEditStaff(null)}
        onCancelEditClient={() => setEditClient(null)} onStartEditStaff={(item) => setEditStaff({ ...item, password: '' })}
        onStartEditClient={(item) => setEditClient({ ...item, password: '' })}
      /> : null}
      {tab === 'doors' ? <DoorsTab
        doors={doors} doorForm={doorForm} editDoor={editDoor}
        onDoorFormChange={setDoorForm} onCreateDoor={onCreateDoor} onEditDoorChange={setEditDoor}
        onUpdateDoor={onUpdateDoor} onDeleteDoor={onDeleteDoor}
        onStartEditDoor={(item) => setEditDoor({ ...item })} onCancelEditDoor={() => setEditDoor(null)}
      /> : null}
      {tab === 'access' ? <AccessTab
        clients={clients} rooms={rooms} grants={grants}
        assignForm={assignForm} onAssignFormChange={setAssignForm}
        onAssign={onAssign} onRevoke={onRevoke}
      /> : null}
      {tab === 'events' ? <EventsTab events={events} /> : null}
      <ToastStack toasts={toasts} />
    </div>
  )
}
