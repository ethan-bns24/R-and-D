import { useEffect, useState, useCallback } from 'react';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:4000`
).replace(/\/+$/, '');
console.log('Configured API base URL:', API_URL || '(same-origin)');

// Token staff hardcodé pour la démo (valide 10 ans)
const DEMO_STAFF_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdGFmZl9pZCI6ImE4YzQ4NmE1LTc3MDEtNDVjZS04YTRhLThlZjEzNjA2MDdhNiIsImVtYWlsIjoiYWRtaW5AZGVtby5sb2NhbCIsIm5hbWUiOiJBZG1pbiBEZW1vIiwicm9sZSI6ImFkbWluIiwiZXhwIjo0ODY3MTIwMDAwLCJpYXQiOjE3Mzk4NDgwMDAsImlzcyI6ImdybXMtc3RhZmYifQ.qaW9gmamDHVAQIjru75UZdRSYg9fBhabX-EwqCXpk2E';

// Token client hardcodé pour la démo smartphone (valide 10 ans)
// À remplacer par un vrai token généré via /v1/auth/login
const DEMO_CLIENT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiN2ZjOTY3OTQtYTA4My00YWExLWI1YjktYzE4OWRjNmYzOTlmIiwiZW1haWwiOiIxQDIuZnIiLCJuYW1lIjoiSmVhbiBKZWFuIiwiZXhwIjo0ODY3MTIwMDAwLCJpYXQiOjE3Mzk4NDgwMDAsImlzcyI6ImdybXMifQ.OPJA1RvlYzm_EXVAqoZbL1x-mT4rhAkQrKx0nEjX1js';

function App() {
  // Room / Door state
  const [rooms, setRooms] = useState([]);
  const [doors, setDoors] = useState([]);
  const [events, setEvents] = useState([]);
  
  // Guest user for assignment
  const [clients, setClients] = useState([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState('');
  const [selectedRoomNumber, setSelectedRoomNumber] = useState('101');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [lastGrant, setLastGrant] = useState(null);

  // Guest registration
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestEmail, setNewGuestEmail] = useState('');
  const [newGuestPassword, setNewGuestPassword] = useState('');
  const [creatingGuest, setCreatingGuest] = useState(false);

  // Mobile simulation
  const [phonesCount, setPhonesCount] = useState(1);
  const [phoneTokens, setPhoneTokens] = useState({});
  const [phoneStatuses, setPhoneStatuses] = useState({});
  const [phoneLogins, setPhoneLogins] = useState({});

  // Stats
  const [stats, setStats] = useState({ grants: 0, accessOk: 0, accessFail: 0, locked: 0 });

  // Helper to make authenticated requests
  const apiFetch = useCallback(async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEMO_STAFF_TOKEN}`,
      ...options.headers,
    };
    return fetch(url, { ...options, headers });
  }, []);

  // ============================================
  // Data fetching
  // ============================================
  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API_URL}/v1/rooms`);
      if (!res.ok) {
        console.error('Erreur fetchRooms:', res.status, res.statusText);
        return;
      }
      const data = await res.json();
      console.log('Chambres récupérées:', data);
      setRooms(data || []);
    } catch (err) {
      console.error('Erreur de connexion fetchRooms:', err);
    }
  };

  const fetchDoors = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/v1/backoffice/doors`);
      if (!res.ok) return;
      const data = await res.json();
      setDoors(data || []);
    } catch (err) {
      console.error('Erreur fetchDoors:', err);
    }
  }, [apiFetch]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/v1/backoffice/events`);
      if (!res.ok) return;
      const data = await res.json();
      setEvents((data || []).slice().reverse());

      // Recalcul des stats
      let accessOk = 0;
      let accessFail = 0;
      let locked = 0;
      (data || []).forEach((ev) => {
        if (ev.result === 'success') accessOk += 1;
        else if (ev.result === 'denied' || ev.result === 'expired') accessFail += 1;
        if (ev.result === 'locked') locked += 1;
      });
      setStats((s) => ({ ...s, accessOk, accessFail, locked }));
    } catch (err) {
      console.error('Erreur fetchEvents:', err);
    }
  }, [apiFetch]);

  const fetchClients = async () => {
    try {
      // Use legacy endpoint for clients list
      const res = await fetch(`${API_URL}/clients`);
      if (!res.ok) return;
      const data = await res.json();
      setClients(data || []);
    } catch (err) {
      console.error('Erreur fetchClients:', err);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchRooms();
    fetchClients();
    const id = setInterval(() => {
      fetchRooms();
      fetchClients();
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // Fetch doors and events
  useEffect(() => {
    fetchDoors();
    fetchEvents();
    const id = setInterval(() => {
      fetchDoors();
      fetchEvents();
    }, 5000);
    return () => clearInterval(id);
  }, [fetchDoors, fetchEvents]);

  // ============================================
  // Actions
  // ============================================

  // Assign access (check-in)
  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedUserEmail) {
      alert('Veuillez sélectionner un client');
      return;
    }
    try {
      setLoadingAssign(true);
      const now = Math.floor(Date.now() / 1000);
      const fromTs = now;
      const toTs = now + Number(durationMinutes || 60) * 60;

      const res = await apiFetch(`${API_URL}/v1/backoffice/assign`, {
        method: 'POST',
        body: JSON.stringify({
          user_email: selectedUserEmail,
          room_number: String(selectedRoomNumber),
          from_ts: fromTs,
          to_ts: toTs,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Erreur: ${data.error || 'Échec de l\'assignation'}`);
        return;
      }
      setLastGrant(data);
      setStats((s) => ({ ...s, grants: s.grants + 1 }));
      await fetchDoors();
      await fetchEvents();
      await fetchRooms();
    } catch {
      alert("Erreur de connexion à l'API GRMS");
    } finally {
      setLoadingAssign(false);
    }
  };

  // Revoke access (check-out)
  const handleRevoke = async () => {
    if (!lastGrant?.grant_id) {
      alert('Aucun accès à révoquer');
      return;
    }
    try {
      const res = await apiFetch(`${API_URL}/v1/backoffice/revoke`, {
        method: 'POST',
        body: JSON.stringify({ grant_id: lastGrant.grant_id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Erreur: ${data.error || 'Échec de la révocation'}`);
        return;
      }
      setLastGrant(null);
      await fetchDoors();
      await fetchEvents();
      await fetchRooms();
    } catch {
      alert("Erreur de connexion à l'API GRMS");
    }
  };

  // Unlock door
  const handleUnlockDoor = async (doorId) => {
    try {
      const res = await apiFetch(`${API_URL}/v1/backoffice/doors/unlock`, {
        method: 'POST',
        body: JSON.stringify({ door_id: doorId }),
      });
      if (!res.ok) {
        alert('Échec du déverrouillage');
        return;
      }
      await fetchDoors();
      await fetchEvents();
    } catch {
      alert("Erreur lors du déverrouillage");
    }
  };

  // Create guest account
  const handleCreateGuest = async (e) => {
    e.preventDefault();
    if (!newGuestName.trim() || !newGuestEmail.trim() || !newGuestPassword.trim()) {
      alert('Nom, email et mot de passe sont requis');
      return;
    }
    try {
      setCreatingGuest(true);
      const res = await fetch(`${API_URL}/v1/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGuestName.trim(),
          email: newGuestEmail.trim(),
          password: newGuestPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Erreur: ${data.error || 'Échec de la création'}`);
        return;
      }
      alert(`Client créé avec succès!\n\nIdentifiants iOS:\n- email: ${newGuestEmail}\n- mot de passe: ${newGuestPassword}`);
      setNewGuestName('');
      setNewGuestEmail('');
      setNewGuestPassword('');
      await fetchClients();
      setSelectedUserEmail(newGuestEmail.trim());
    } catch {
      alert("Erreur lors de la création du client");
    } finally {
      setCreatingGuest(false);
    }
  };

  // Phone simulation - use hardcoded demo token or login
  const handlePhoneLogin = async (idx) => {
    // Mode démo : utiliser le token client hardcodé
    if (DEMO_CLIENT_TOKEN && DEMO_CLIENT_TOKEN !== 'PLACEHOLDER') {
      setPhoneTokens((prev) => ({ ...prev, [idx]: DEMO_CLIENT_TOKEN }));
      setPhoneStatuses((prev) => ({ ...prev, [idx]: '✓ Connecté (mode démo)' }));
      
      // Fetch grants avec le token démo
      try {
        const grantsRes = await fetch(`${API_URL}/v1/mobile/grants`, {
          headers: { Authorization: `Bearer ${DEMO_CLIENT_TOKEN}` },
        });
        const grantsData = await grantsRes.json();
        if (grantsRes.ok && grantsData?.grants?.length > 0) {
          setPhoneStatuses((prev) => ({
            ...prev,
            [idx]: `✓ Connecté - ${grantsData.grants.length} accès disponible(s)`,
          }));
        } else {
          setPhoneStatuses((prev) => ({ ...prev, [idx]: '✓ Connecté (aucun accès assigné)' }));
        }
      } catch {
        setPhoneStatuses((prev) => ({ ...prev, [idx]: '✓ Connecté (mode démo)' }));
      }
      return;
    }

    // Mode normal : login avec email/password
    const loginData = phoneLogins[idx];
    if (!loginData?.email || !loginData?.password) {
      setPhoneStatuses((prev) => ({ ...prev, [idx]: 'Renseigne email et mot de passe' }));
      return;
    }
    try {
      const res = await fetch(`${API_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginData.email, password: loginData.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneStatuses((prev) => ({ ...prev, [idx]: `Connexion échouée: ${data.error || 'erreur'}` }));
        return;
      }
      setPhoneTokens((prev) => ({ ...prev, [idx]: data.token }));
      setPhoneStatuses((prev) => ({ ...prev, [idx]: 'Connecté! Récupération des accès...' }));
      // Fetch grants
      const grantsRes = await fetch(`${API_URL}/v1/mobile/grants`, {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      const grantsData = await grantsRes.json();
      if (grantsRes.ok && grantsData?.grants?.length > 0) {
        setPhoneStatuses((prev) => ({
          ...prev,
          [idx]: `${grantsData.grants.length} accès trouvé(s). Prêt à ouvrir!`,
        }));
      } else {
        setPhoneStatuses((prev) => ({ ...prev, [idx]: 'Connecté mais aucun accès assigné.' }));
      }
    } catch {
      setPhoneStatuses((prev) => ({ ...prev, [idx]: 'Impossible de joindre le serveur' }));
    }
  };

  // Phone simulation - simulate BLE access
  const handlePhoneAccess = async (idx) => {
    const token = phoneTokens[idx];
    if (!token) {
      setPhoneStatuses((prev) => ({ ...prev, [idx]: 'Connecte-toi d\'abord!' }));
      return;
    }
    try {
      const grantsRes = await fetch(`${API_URL}/v1/mobile/grants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const grantsData = await grantsRes.json();
      console.log('Grants pour téléphone', idx, grantsData);
      if (!grantsRes.ok || !grantsData?.grants?.length) {
        setPhoneStatuses((prev) => ({ ...prev, [idx]: 'Aucun accès valide trouvé.' }));
        return;
      }

      // Record access event for each grant (simulate BLE door unlock)
      const grant = grantsData.grants[0]; // Use first active grant
      
      // Get door_id from the doors array inside the grant
      if (!grant.doors || grant.doors.length === 0) {
        setPhoneStatuses((prev) => ({ ...prev, [idx]: 'Aucune porte associée à cet accès.' }));
        return;
      }
      
      const door = grant.doors[0]; // Use first door
      const accessRes = await fetch(`${API_URL}/v1/mobile/access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          grant_id: grant.grant_id,
          door_id: door.door_id,
          result: 'success',
        }),
      });

      if (accessRes.ok) {
        setPhoneStatuses((prev) => ({
          ...prev,
          [idx]: `🔓 Porte ${door.ble_id} ouverte! Accès enregistré.`,
        }));
      } else {
        const errData = await accessRes.json().catch(() => ({}));
        setPhoneStatuses((prev) => ({
          ...prev,
          [idx]: `Erreur: ${errData.error || 'échec enregistrement'}`,
        }));
      }

      await fetchEvents();
    } catch {
      setPhoneStatuses((prev) => ({ ...prev, [idx]: 'Erreur de communication BLE simulée' }));
    }
  };

  // ============================================
  // RENDER
  // ============================================

  // Main dashboard
  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '2.5rem 1.5rem 3rem',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1200,
          background: 'linear-gradient(135deg, rgba(15,23,42,0.96), rgba(15,23,42,0.98))',
          borderRadius: '1.75rem',
          padding: '2.25rem 2.5rem',
          boxShadow: '0 28px 80px rgba(15,23,42,0.9)',
          border: '1px solid rgba(148,163,184,0.35)',
          color: '#e5e7eb',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1.5rem',
            marginBottom: '2rem',
          }}
        >
          <div>
            <p
              style={{
                fontSize: '0.8rem',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#38bdf8',
                margin: 0,
                marginBottom: '0.25rem',
              }}
            >
              Accor · Concept Room
            </p>
            <h1 style={{ margin: 0 }}>GRMS · Smart Room Dashboard</h1>
            <p style={{ marginTop: '0.35rem', color: '#9ca3af', maxWidth: 520 }}>
              Gestion des accès chambres, assignation des clés numériques et suivi des événements d'accès.
            </p>
          </div>
          <div
            style={{
              padding: '0.75rem 1.1rem',
              borderRadius: '999px',
              background: 'rgba(15,23,42,0.85)',
              border: '1px solid rgba(148,163,184,0.45)',
              fontSize: '0.8rem',
              color: '#9ca3af',
            }}
          >
            <span style={{ display: 'block', fontWeight: 500, color: '#e5e7eb' }}>Mode démo</span>
            <span>Backoffice GRMS</span>
          </div>
        </header>

        {/* Stats bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          {[
            { label: 'Accès assignés', value: stats.grants, color: '#38bdf8' },
            { label: 'Accès réussis', value: stats.accessOk, color: '#22c55e' },
            { label: 'Accès refusés', value: stats.accessFail, color: '#f97316' },
            { label: 'Portes verrouillées', value: stats.locked, color: '#ef4444' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                padding: '1rem',
                borderRadius: '1rem',
                background: 'rgba(15,23,42,0.8)',
                border: '1px solid rgba(55,65,81,0.8)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Main content */}
        <main
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: '1.75rem',
          }}
        >
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Assign access (check-in) */}
            <section
              style={{
                background: 'radial-gradient(circle at top left, #0b1120, #020617)',
                borderRadius: '1.5rem',
                padding: '1.5rem 1.75rem',
                border: '1px solid rgba(55,65,81,0.8)',
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: '1rem', color: '#9ca3af' }}>
                Assigner un accès (Check-in)
              </h2>
              <form
                onSubmit={handleAssign}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem 1.4rem',
                  alignItems: 'end',
                }}
              >
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                    Client (email)
                    <select
                      style={{
                        marginTop: '0.35rem',
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '0.5rem',
                        backgroundColor: '#1f2937',
                        color: '#e5e7eb',
                        border: '1px solid #374151',
                      }}
                      value={selectedUserEmail}
                      onChange={(e) => setSelectedUserEmail(e.target.value)}
                    >
                      <option value="">-- Sélectionner un client --</option>
                      {clients.map((c) => (
                        <option key={c.id || c.email} value={c.email}>
                          {c.name} ({c.email})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                    N° Chambre
                    <input
                      type="text"
                      style={{ marginTop: '0.35rem', width: '100%' }}
                      value={selectedRoomNumber}
                      onChange={(e) => setSelectedRoomNumber(e.target.value)}
                      placeholder="101"
                    />
                  </label>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                    Durée (min)
                    <input
                      type="number"
                      min="1"
                      style={{ marginTop: '0.35rem', width: '100%' }}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                    />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-start' }}>
                  <button type="submit" disabled={loadingAssign}>
                    {loadingAssign ? 'Assignation…' : 'Assigner l\'accès'}
                  </button>
                  <button type="button" onClick={handleRevoke} disabled={!lastGrant}>
                    Révoquer
                  </button>
                </div>
              </form>

              {lastGrant && (
                <div
                  style={{
                    marginTop: '1.4rem',
                    padding: '0.95rem 1.05rem',
                    borderRadius: '1rem',
                    background:
                      'linear-gradient(120deg, rgba(8,47,73,0.95), rgba(8,47,73,0.7), rgba(30,64,175,0.7))',
                    border: '1px solid rgba(56,189,248,0.65)',
                    fontSize: '0.9rem',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.75rem',
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Dernier accès assigné
                  </div>
                  <div style={{ marginTop: '0.3rem', fontSize: '0.85rem' }}>
                    <strong>Grant ID:</strong>{' '}
                    <span style={{ fontFamily: 'SF Mono, Menlo, ui-monospace', fontSize: '0.78rem' }}>
                      {lastGrant.grant_id}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#bfdbfe', marginTop: '0.3rem' }}>
                    Valide de {new Date(lastGrant.from_ts * 1000).toLocaleString()} à{' '}
                    {new Date(lastGrant.to_ts * 1000).toLocaleString()}
                  </div>
                </div>
              )}
            </section>

            {/* Create guest */}
            <section
              style={{
                background: 'radial-gradient(circle at top, #020617, #020617)',
                borderRadius: '1.5rem',
                padding: '1.25rem 1.5rem',
                border: '1px solid rgba(55,65,81,0.8)',
              }}
            >
              <h2 style={{ margin: 0, marginBottom: '1rem', color: '#9ca3af' }}>
                Créer un compte client
              </h2>
              <form
                onSubmit={handleCreateGuest}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '0.75rem',
                  alignItems: 'end',
                }}
              >
                <input
                  placeholder="Nom"
                  value={newGuestName}
                  onChange={(e) => setNewGuestName(e.target.value)}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newGuestEmail}
                  onChange={(e) => setNewGuestEmail(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="Mot de passe"
                  value={newGuestPassword}
                  onChange={(e) => setNewGuestPassword(e.target.value)}
                />
                <button type="submit" disabled={creatingGuest}>
                  {creatingGuest ? 'Création…' : 'Créer'}
                </button>
              </form>
              <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#6b7280' }}>
                Le client pourra se connecter via l'app iOS avec ces identifiants.
              </p>
            </section>

            {/* Phone simulation */}
            <section
              style={{
                background: 'radial-gradient(circle at top, #020617, #020617)',
                borderRadius: '1.5rem',
                padding: '1.25rem 1.5rem',
                border: '1px solid rgba(55,65,81,0.8)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1rem',
                }}
              >
                <h2 style={{ margin: 0, color: '#9ca3af' }}>Simulation smartphone client</h2>
                <select
                  value={phonesCount}
                  onChange={(e) => setPhonesCount(Number(e.target.value))}
                  style={{
                    borderRadius: '999px',
                    padding: '0.3rem 0.8rem',
                    fontSize: '0.8rem',
                  }}
                >
                  <option value={1}>1 téléphone</option>
                  <option value={2}>2 téléphones</option>
                  <option value={3}>3 téléphones</option>
                </select>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${phonesCount}, minmax(0, 1fr))`,
                  gap: '1rem',
                }}
              >
                {Array.from({ length: phonesCount }).map((_, idx) => (
                  <div
                    key={idx}
                    style={{
                      borderRadius: '1.5rem',
                      padding: '1rem',
                      background: 'rgba(15,23,42,0.9)',
                      border: '1px solid rgba(55,65,81,0.9)',
                    }}
                  >
                    <div
                      style={{
                        width: 60,
                        height: 4,
                        borderRadius: 999,
                        backgroundColor: '#4b5563',
                        margin: '0 auto 0.8rem',
                      }}
                    />
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: '#9ca3af',
                        marginBottom: '0.5rem',
                        textAlign: 'center',
                      }}
                    >
                      Smartphone {idx + 1}
                    </div>

                    {!phoneTokens[idx] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <input
                          placeholder="Email client"
                          value={phoneLogins[idx]?.email || ''}
                          onChange={(e) =>
                            setPhoneLogins((prev) => ({
                              ...prev,
                              [idx]: { ...prev[idx], email: e.target.value },
                            }))
                          }
                          style={{ fontSize: '0.8rem' }}
                        />
                        <input
                          type="password"
                          placeholder="Mot de passe"
                          value={phoneLogins[idx]?.password || ''}
                          onChange={(e) =>
                            setPhoneLogins((prev) => ({
                              ...prev,
                              [idx]: { ...prev[idx], password: e.target.value },
                            }))
                          }
                          style={{ fontSize: '0.8rem' }}
                        />
                        <button
                          type="button"
                          onClick={() => handlePhoneLogin(idx)}
                          style={{ fontSize: '0.8rem' }}
                        >
                          Se connecter
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: '#22c55e',
                            textAlign: 'center',
                          }}
                        >
                          ✓ Connecté
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePhoneAccess(idx)}
                          style={{ fontSize: '0.8rem' }}
                        >
                          Ouvrir la porte (BLE)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPhoneTokens((prev) => {
                              const n = { ...prev };
                              delete n[idx];
                              return n;
                            });
                            setPhoneStatuses((prev) => {
                              const n = { ...prev };
                              delete n[idx];
                              return n;
                            });
                          }}
                          style={{
                            fontSize: '0.75rem',
                            background: 'transparent',
                            border: '1px solid rgba(248,113,113,0.5)',
                            color: '#fca5a5',
                          }}
                        >
                          Déconnexion
                        </button>
                      </div>
                    )}

                    {phoneStatuses[idx] && (
                      <p
                        style={{
                          marginTop: '0.6rem',
                          fontSize: '0.75rem',
                          textAlign: 'center',
                          color: phoneStatuses[idx].includes('autorisé') || phoneStatuses[idx].includes('Connecté')
                            ? '#6ee7b7'
                            : '#fca5a5',
                        }}
                      >
                        {phoneStatuses[idx]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Rooms */}
            <section
              style={{
                background: 'radial-gradient(circle at top, #020617, #020617)',
                borderRadius: '1.5rem',
                padding: '1.25rem 1.5rem',
                border: '1px solid rgba(55,65,81,0.8)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <h2 style={{ margin: 0, color: '#9ca3af' }}>Chambres</h2>
                <button
                  onClick={fetchRooms}
                  style={{ paddingInline: '1rem', fontSize: '0.8rem' }}
                >
                  Rafraîchir
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {rooms.map((r) => (
                  <div
                    key={r.room_id || r.id}
                    style={{
                      borderRadius: '1rem',
                      padding: '0.8rem',
                      background: 'rgba(15,23,42,0.9)',
                      border: '1px solid rgba(75,85,99,0.9)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Chambre</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {r.room_number || `#${r.id}`}
                    </div>
                    <div
                      style={{
                        marginTop: '0.35rem',
                        fontSize: '0.72rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '999px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        background:
                          r.status === 'locked'
                            ? 'rgba(185,28,28,0.18)'
                            : r.status === 'occupied'
                            ? 'rgba(21,128,61,0.2)'
                            : 'rgba(37,99,235,0.16)',
                        color:
                          r.status === 'locked'
                            ? '#fecaca'
                            : r.status === 'occupied'
                            ? '#bbf7d0'
                            : '#bfdbfe',
                        border:
                          r.status === 'locked'
                            ? '1px solid rgba(248,113,113,0.7)'
                            : r.status === 'occupied'
                            ? '1px solid rgba(34,197,94,0.45)'
                            : '1px solid rgba(59,130,246,0.45)',
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '999px',
                          backgroundColor:
                            r.status === 'locked'
                              ? '#f97373'
                              : r.status === 'occupied'
                              ? '#22c55e'
                              : '#60a5fa',
                        }}
                      />
                      <span>
                        {r.status === 'locked'
                          ? 'Verrouillée'
                          : r.status === 'occupied'
                          ? 'Occupée'
                          : r.status === 'maintenance'
                          ? 'Maintenance'
                          : 'Disponible'}
                      </span>
                    </div>
                  </div>
                ))}
                {rooms.length === 0 && (
                  <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    Aucune chambre chargée.
                  </p>
                )}
              </div>
            </section>

            {/* Doors */}
            <section
              style={{
                background: 'radial-gradient(circle at top, #020617, #020617)',
                borderRadius: '1.5rem',
                padding: '1.25rem 1.5rem',
                border: '1px solid rgba(55,65,81,0.8)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <h2 style={{ margin: 0, color: '#9ca3af' }}>Portes (Serrures)</h2>
                <button
                  onClick={fetchDoors}
                  style={{ paddingInline: '1rem', fontSize: '0.8rem' }}
                >
                  Rafraîchir
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {doors.map((d) => (
                  <div
                    key={d.door_id}
                    style={{
                      borderRadius: '1rem',
                      padding: '0.8rem',
                      background: 'rgba(15,23,42,0.9)',
                      border: '1px solid rgba(75,85,99,0.9)',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Porte</div>
                    <div
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        fontFamily: 'SF Mono, Menlo, ui-monospace',
                      }}
                    >
                      {d.ble_id}
                    </div>
                    <div
                      style={{
                        marginTop: '0.35rem',
                        fontSize: '0.72rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        color:
                          d.status === 'online'
                            ? '#6ee7b7'
                            : d.status === 'locked'
                            ? '#fca5a5'
                            : '#9ca3af',
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '999px',
                          backgroundColor:
                            d.status === 'online'
                              ? '#22c55e'
                              : d.status === 'locked'
                              ? '#ef4444'
                              : '#6b7280',
                        }}
                      />
                      {d.status === 'online'
                        ? 'En ligne'
                        : d.status === 'locked'
                        ? 'Verrouillée'
                        : 'Hors ligne'}
                    </div>
                    {d.status === 'locked' && (
                      <button
                        type="button"
                        onClick={() => handleUnlockDoor(d.door_id)}
                        style={{
                          marginTop: '0.5rem',
                          width: '100%',
                          fontSize: '0.72rem',
                          padding: '0.35rem',
                          background: 'rgba(127,29,29,0.3)',
                          borderColor: 'rgba(248,113,113,0.7)',
                        }}
                      >
                        Déverrouiller
                      </button>
                    )}
                  </div>
                ))}
                {doors.length === 0 && (
                  <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    Aucune porte connectée.
                  </p>
                )}
              </div>
            </section>

            {/* Events log */}
            <section
              style={{
                background: 'radial-gradient(circle at top, #020617, #020617)',
                borderRadius: '1.5rem',
                padding: '1.25rem 1.5rem',
                border: '1px solid rgba(55,65,81,0.8)',
                maxHeight: 300,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <h2 style={{ margin: 0, color: '#9ca3af' }}>Événements d'accès</h2>
                <button
                  onClick={fetchEvents}
                  style={{ paddingInline: '1rem', fontSize: '0.8rem' }}
                >
                  Rafraîchir
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  paddingRight: '0.2rem',
                }}
              >
                {events.length === 0 && (
                  <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    Aucun événement pour le moment.
                  </p>
                )}
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                  }}
                >
                  {events.map((ev, idx) => (
                    <li
                      key={ev.event_id || idx}
                      style={{
                        padding: '0.4rem 0.6rem',
                        borderRadius: '0.75rem',
                        background: 'rgba(15,23,42,0.9)',
                        border: '1px solid rgba(31,41,55,0.8)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                        }}
                      >
                        <span style={{ color: '#9ca3af' }}>
                          {ev.door_id?.substring(0, 8) || '-'}
                        </span>
                        <span
                          style={{
                            color:
                              ev.result === 'success'
                                ? '#6ee7b7'
                                : ev.result === 'denied'
                                ? '#fca5a5'
                                : '#f97316',
                            fontWeight: 500,
                          }}
                        >
                          {ev.result === 'success'
                            ? 'OK'
                            : ev.result === 'denied'
                            ? 'Refusé'
                            : ev.result}
                        </span>
                      </div>
                      <div style={{ marginTop: '0.1rem', color: '#6b7280', fontSize: '0.75rem' }}>
                        {ev.ts ? new Date(ev.ts).toLocaleString() : '-'}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
