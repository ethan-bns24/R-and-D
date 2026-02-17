import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
console.log('API_URL configurée:', API_URL);

function App() {
  const [rooms, setRooms] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedClientIdForCheckin, setSelectedClientIdForCheckin] = useState('');
  const [roomId, setRoomId] = useState(101);
  const [lastToken, setLastToken] = useState('');
  const [loadingCheckin, setLoadingCheckin] = useState(false);
  const [simulatingAccess, setSimulatingAccess] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [clients, setClients] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPassword, setNewClientPassword] = useState('');
  const [newResClientId, setNewResClientId] = useState('');
  const [newResRoomId, setNewResRoomId] = useState(101);
  const [newResStart, setNewResStart] = useState('');
  const [newResEnd, setNewResEnd] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [creatingReservation, setCreatingReservation] = useState(false);
  const [phonesCount, setPhonesCount] = useState(1);
  const [phoneStatuses, setPhoneStatuses] = useState({});
  const [stats, setStats] = useState({ checkins: 0, authOk: 0, authFail: 0, intrusions: 0 });
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedClientDetails, setSelectedClientDetails] = useState(null);
  const [editingClient, setEditingClient] = useState(null);

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API_URL}/rooms`);
      if (!res.ok) {
        console.error('Erreur fetchRooms:', res.status, res.statusText);
        return;
      }
      const data = await res.json();
      console.log('Chambres récupérées:', data);
      setRooms(data);
    } catch (err) {
      console.error('Erreur de connexion fetchRooms:', err);
    }
  };

  const fetchLogs = async () => {
    const res = await fetch(`${API_URL}/logs`);
    const data = await res.json();
    setLogs(data.slice().reverse());

    // recalcul des stats simples à partir des logs
    let checkins = 0;
    let authOk = 0;
    let authFail = 0;
    let intrusions = 0;
    data.forEach((log) => {
      switch (log.type) {
        case 'CHECKIN':
        case 'CHECKIN_FROM_RESERVATION':
          checkins += 1;
          break;
        case 'AUTH_ATTEMPT':
          if (log.success) authOk += 1;
          else authFail += 1;
          break;
        case 'INTRUSION_LOCK':
        case 'ROOM_UNLOCKED':
          intrusions += 1;
          break;
        default:
          break;
      }
    });
    setStats({ checkins, authOk, authFail, intrusions });
  };

  const fetchClients = async () => {
    const res = await fetch(`${API_URL}/clients`);
    const data = await res.json();
    setClients(data);
  };

  const fetchClientDetails = async (id) => {
    try {
      const res = await fetch(`${API_URL}/clients/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setSelectedClientId(id);
      setSelectedClientDetails(data);
      setEditingClient({
        name: data.client.name || '',
        email: data.client.email || '',
        phone: data.client.phone || '',
        status: data.client.status || '',
      });
    } catch {
      // ignore for l'instant
    }
  };

  const fetchReservations = async () => {
    const res = await fetch(`${API_URL}/reservations`);
    const data = await res.json();
    setReservations(data.slice().reverse());
  };

  useEffect(() => {
    fetchRooms();
    fetchLogs();
    fetchClients();
    fetchReservations();
    const id = setInterval(() => {
      fetchRooms();
      fetchLogs();
      fetchClients();
      fetchReservations();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Pré-remplir les dates de réservation (maintenant et +1h) pour simplifier la saisie
  useEffect(() => {
    const formatLocal = (d) => d.toISOString().slice(0, 16);
    if (!newResStart || !newResEnd) {
      const now = new Date();
      const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
      if (!newResStart) setNewResStart(formatLocal(now));
      if (!newResEnd) setNewResEnd(formatLocal(inOneHour));
    }
  }, [newResStart, newResEnd]);

  const handleCheckin = async (e) => {
    e.preventDefault();
    if (!selectedClientIdForCheckin) {
      alert('Veuillez sélectionner un client');
      return;
    }
    try {
      setLoadingCheckin(true);
      const now = Date.now();
      const validFrom = new Date(now).toISOString();
      const validTo = new Date(now + Number(durationMinutes || 0) * 60 * 1000).toISOString();

      const res = await fetch(`${API_URL}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: Number(selectedClientIdForCheckin),
          roomId: Number(roomId),
          validFrom,
          validTo,
        }),
      });
      const data = await res.json();
      if (data.token) {
        setLastToken(data.token);
        await fetchRooms();
        await fetchLogs();
      } else {
        alert('Erreur de check-in');
      }
    } catch (err) {
      alert("Erreur de connexion à l'API GRMS");
    } finally {
      setLoadingCheckin(false);
    }
  };

  const simulateAccess = async () => {
    if (!lastToken) {
      alert('Aucun token généré pour le moment.');
      return;
    }
    try {
      setSimulatingAccess(true);
      const res = await fetch(`${API_URL}/tokens/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenValue: lastToken, roomId: Number(roomId) }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(
          `Accès refusé (${data.reason || 'erreur'}). Consulte les logs pour le détail.`,
        );
      }
      await fetchLogs();
    } catch (e) {
      alert("Erreur de connexion à l'API GRMS lors de la simulation d'accès.");
    } finally {
      setSimulatingAccess(false);
    }
  };

  const handlePhoneAccess = async (idx) => {
    if (!lastToken) {
      setPhoneStatuses((prev) => ({
        ...prev,
        [idx]: "Aucune clé disponible. Génère d'abord un token côté accueil.",
      }));
      return;
    }
    try {
      const res = await fetch(`${API_URL}/tokens/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenValue: lastToken, roomId: Number(roomId) }),
      });
      const data = await res.json();
      if (data.ok) {
        setPhoneStatuses((prev) => ({
          ...prev,
          [idx]: 'Accès autorisé – porte ouverte (simulation).',
        }));
      } else {
        setPhoneStatuses((prev) => ({
          ...prev,
          [idx]: `Accès refusé (${data.reason || 'erreur'}).`,
        }));
      }
      await fetchLogs();
    } catch {
      setPhoneStatuses((prev) => ({
        ...prev,
        [idx]: "Impossible de joindre le GRMS depuis le smartphone.",
      }));
    }
  };

  const handleCheckout = async () => {
    try {
      setLoadingCheckout(true);
      const res = await fetch(`${API_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: Number(roomId) }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert("Échec de la libération de la chambre.");
      } else {
        setLastToken('');
        await fetchRooms();
        await fetchLogs();
      }
    } catch (e) {
      alert("Erreur de connexion à l'API GRMS lors du checkout.");
    } finally {
      setLoadingCheckout(false);
    }
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (!newClientName.trim()) return;
    try {
      setCreatingClient(true);
      const email = newClientEmail.trim();
      let passwordToSend = newClientPassword;

      // Si l'email est renseigné, il faut un mot de passe pour pouvoir se connecter sur l'app iOS.
      // Pour la démo, si aucun mot de passe n'est fourni, on en génère un et on l'affiche une seule fois.
      if (email && !passwordToSend) {
        passwordToSend = `demo-${Math.random().toString(36).slice(2, 10)}`;
      }

      const res = await fetch(`${API_URL}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClientName.trim(),
          email: email || undefined,
          password: email ? passwordToSend : undefined,
        }),
      });
      const data = await res.json();

      if (email) {
        alert(
          `Client créé.\n\nIdentifiants iOS:\n- email: ${email}\n- mot de passe: ${passwordToSend}\n\nNote: conserve-le, il ne sera plus affiché.`,
        );
      } else if (newClientPassword) {
        alert("Tu as saisi un mot de passe, mais sans email il ne servira pas à la connexion iOS.");
      }

      setNewClientName('');
      setNewClientEmail('');
      setNewClientPassword('');
      await fetchClients();
      setNewResClientId(String(data.id));
      fetchClientDetails(data.id);
    } catch {
      alert("Erreur lors de la création du client.");
    } finally {
      setCreatingClient(false);
    }
  };

  const handleCreateReservation = async (e) => {
    e.preventDefault();
    if (!newResClientId || !newResRoomId || !newResStart || !newResEnd) {
      alert('Merci de remplir tous les champs de réservation.');
      return;
    }
    try {
      setCreatingReservation(true);
      const res = await fetch(`${API_URL}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: Number(newResClientId),
          roomId: Number(newResRoomId),
          startDate: newResStart,
          endDate: newResEnd,
        }),
      });
      await res.json();
      await fetchReservations();
    } catch {
      alert("Erreur lors de la création de la réservation.");
    } finally {
      setCreatingReservation(false);
    }
  };

  const handleCheckinFromLastReservation = async () => {
    if (reservations.length === 0) {
      alert('Aucune réservation disponible.');
      return;
    }
    const lastRes = reservations[0];
    try {
      setLoadingCheckin(true);
      const res = await fetch(`${API_URL}/reservations/${lastRes.id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.token) {
        setLastToken(data.token);
        setRoomId(lastRes.roomId);
        await fetchRooms();
        await fetchLogs();
      } else {
        alert("Échec du check-in à partir de la réservation.");
      }
    } catch {
      alert("Erreur de connexion à l'API GRMS lors du check-in réservation.");
    } finally {
      setLoadingCheckin(false);
    }
  };

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
          maxWidth: 1100,
          background: 'linear-gradient(135deg, rgba(15,23,42,0.96), rgba(15,23,42,0.98))',
          borderRadius: '1.75rem',
          padding: '2.25rem 2.5rem',
          boxShadow: '0 28px 80px rgba(15,23,42,0.9)',
          border: '1px solid rgba(148,163,184,0.35)',
          color: '#e5e7eb',
        }}
      >
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
              Simulateur d'accueil hôtel & chambre intelligente : check-in, génération de token
              sécurisé et suivi des tentatives d'accès.
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
            <span>Flux local GRMS ↔ chambre ↔ smartphone</span>
          </div>
        </header>

        <main
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: '1.75rem',
          }}
        >
          <section
            style={{
              background: 'radial-gradient(circle at top left, #0b1120, #020617)',
              borderRadius: '1.5rem',
              padding: '1.5rem 1.75rem',
              border: '1px solid rgba(55,65,81,0.8)',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '1rem', color: '#9ca3af' }}>Check-in client</h2>
            <form
              onSubmit={handleCheckin}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem 1.4rem',
                alignItems: 'end',
              }}
            >
              <div>
                <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                  Client
                  <select
                    style={{ marginTop: '0.35rem', width: '100%', padding: '0.5rem', borderRadius: '0.5rem', backgroundColor: '#1f2937', color: '#e5e7eb', border: '1px solid #374151' }}
                    value={selectedClientIdForCheckin}
                    onChange={(e) => setSelectedClientIdForCheckin(e.target.value)}
                  >
                    <option value="">-- Sélectionner un client --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.email ? `(${c.email})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                  Room ID
                  <input
                    type="number"
                    style={{ marginTop: '0.35rem', width: '100%' }}
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                  />
                </label>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                  Durée de validité (min)
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
                <button type="submit" disabled={loadingCheckin}>
                  {loadingCheckin ? 'Génération…' : 'Générer le token sécurisé'}
                </button>
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={loadingCheckout}
                >
                  {loadingCheckout ? 'Libération…' : 'Libérer la chambre'}
                </button>
              </div>
            </form>

            {lastToken && (
              <div
                style={{
                  marginTop: '1.4rem',
                  padding: '0.95rem 1.05rem',
                  borderRadius: '1rem',
                  background:
                    'linear-gradient(120deg, rgba(8,47,73,0.95), rgba(8,47,73,0.7), rgba(30,64,175,0.7))',
                  border: '1px solid rgba(56,189,248,0.65)',
                  fontSize: '0.9rem',
                  wordBreak: 'break-all',
                }}
              >
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                  Dernier token généré
                </div>
                <div style={{ marginTop: '0.3rem', fontFamily: 'SF Mono, Menlo, ui-monospace', fontSize: '0.88rem' }}>
                  {lastToken}
                </div>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: '#bfdbfe' }}>
                  Utilise ce token dans le simulateur de chambre pour vérifier l'ouverture automatique.
                </p>
              </div>
            )}
          </section>

          <section
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div
              style={{
                background: 'radial-gradient(circle at top, #020617, #020617)',
                borderRadius: '1.5rem',
                padding: '1.25rem 1.5rem 1.9rem',
                border: '1px solid rgba(55,65,81,0.8)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.4rem',
                }}
              >
                <h2 style={{ margin: 0, color: '#9ca3af' }}>Chambres</h2>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={fetchRooms} style={{ paddingInline: '1rem', fontSize: '0.8rem' }}>
                    Rafraîchir
                  </button>
                  <button
                    type="button"
                    onClick={simulateAccess}
                    disabled={simulatingAccess}
                    style={{ paddingInline: '1rem', fontSize: '0.8rem' }}
                  >
                    {simulatingAccess ? 'Simulation…' : 'Simuler un accès client'}
                  </button>
                </div>
              </div>
              <p style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '0.8rem', color: '#6b7280' }}>
                Statut temps réel des chambres simulées.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {rooms.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      borderRadius: '1rem',
                      padding: '0.8rem 0.9rem',
                      background: 'rgba(15,23,42,0.9)',
                      border: '1px solid rgba(75,85,99,0.9)',
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Chambre</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>#{r.id}</div>
                    <div
                      style={{
                        marginTop: '0.35rem',
                        fontSize: '0.78rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '999px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
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
                          width: 6,
                          height: 6,
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
                          ? 'Verrouillée (intrusion)'
                          : r.status === 'occupied'
                          ? 'Occupée'
                          : 'Disponible'}
                      </span>
                    </div>
                    {r.status === 'locked' && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await fetch(`${API_URL}/rooms/unlock`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ roomId: r.id }),
                            });
                            await fetchRooms();
                            await fetchLogs();
                          } catch {
                            alert("Erreur lors du déverrouillage de la chambre.");
                          }
                        }}
                        style={{
                          marginTop: '0.45rem',
                          paddingInline: '0.9rem',
                          fontSize: '0.78rem',
                          background:
                            'linear-gradient(135deg, rgba(127,29,29,0.9), rgba(185,28,28,0.95))',
                          borderColor: 'rgba(248,113,113,0.9)',
                        }}
                      >
                        Lever l'alerte
                      </button>
                    )}
                  </div>
                ))}
                {rooms.length === 0 && (
                  <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    Aucune chambre chargée pour l'instant.
                  </p>
                )}
              </div>
            </div>

            <div
              style={{
                background: 'radial-gradient(circle at top, #020617, #020617)',
                borderRadius: '1.5rem',
                padding: '1.25rem 1.5rem',
                border: '1px solid rgba(55,65,81,0.8)',
              }}
            >
              <h2 style={{ margin: 0, color: '#9ca3af' }}>Clients & réservations</h2>
              <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                Prototype de fichier client et de gestion de réservations pour check-in anticipé.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1.4fr)',
                  gap: '1rem',
                  marginTop: '0.5rem',
                }}
              >
                <form onSubmit={handleCreateClient} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>Nouveau client</div>
                  <input
                    placeholder="Nom"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                  />
                  <input
                    placeholder="Email (optionnel)"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="Mot de passe (nécessaire pour connexion iOS si email renseigné)"
                    value={newClientPassword}
                    onChange={(e) => setNewClientPassword(e.target.value)}
                  />
                  <div style={{ fontSize: '0.72rem', color: '#6b7280', lineHeight: 1.3 }}>
                    Si tu mets un email mais pas de mot de passe, le GRMS générera un mot de passe de démo et te l’affichera une seule fois.
                  </div>
                  <button type="submit" disabled={creatingClient} style={{ width: 'fit-content' }}>
                    {creatingClient ? 'Création…' : 'Ajouter le client'}
                  </button>
                  {clients.length > 0 && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        maxHeight: 70,
                        overflowY: 'auto',
                        borderTop: '1px solid rgba(55,65,81,0.9)',
                        paddingTop: '0.35rem',
                      }}
                    >
                      Clients existants :
                      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem' }}>
                        {clients.map((c) => (
                          <li
                            key={c.id}
                            style={{
                              cursor: 'pointer',
                              color: selectedClientId === c.id ? '#e5e7eb' : '#9ca3af',
                            }}
                            onClick={() => fetchClientDetails(c.id)}
                          >
                            #{c.id} {c.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </form>

                <form
                  onSubmit={handleCreateReservation}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
                >
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>Nouvelle réservation</div>
                  <select
                    value={newResClientId}
                    onChange={(e) => setNewResClientId(e.target.value)}
                    style={{ padding: '0.55rem 0.75rem', borderRadius: '0.75rem' }}
                  >
                    <option value="">Choisir un client…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.id} {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Room ID (ex: 101)"
                    value={newResRoomId}
                    onChange={(e) => setNewResRoomId(e.target.value)}
                  />
                  <input
                    type="datetime-local"
                    value={newResStart}
                    onChange={(e) => setNewResStart(e.target.value)}
                  />
                  <input
                    type="datetime-local"
                    value={newResEnd}
                    onChange={(e) => setNewResEnd(e.target.value)}
                  />
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginTop: '0.4rem',
                    }}
                  >
                    <button
                      type="submit"
                      disabled={creatingReservation}
                      style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                    >
                      {creatingReservation ? 'Enregistrement…' : 'Enregistrer la réservation'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCheckinFromLastReservation}
                      style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
                    >
                      Check-in depuis la dernière réservation
                    </button>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', maxHeight: 70, overflowY: 'auto' }}>
                    Dernières réservations :{' '}
                    {reservations.length === 0
                      ? 'aucune'
                      : reservations
                          .slice(0, 3)
                          .map(
                            (r) =>
                              `#${r.id} client ${r.client?.name || r.clientId} · chambre ${
                                r.roomId
                              } · ${r.status}`,
                          )
                          .join(' | ')}
                  </div>
                </form>
              </div>

              {selectedClientDetails && (
                <div
                  style={{
                    marginTop: '1rem',
                    paddingTop: '0.6rem',
                    borderTop: '1px solid rgba(55,65,81,0.9)',
                    fontSize: '0.78rem',
                    color: '#9ca3af',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: '0.4rem',
                      color: '#e5e7eb',
                    }}
                  >
                    Fiche client sélectionné
                  </div>
                  <div
                    style={{
                      borderRadius: '1rem',
                      padding: '0.75rem 0.9rem',
                      background: 'rgba(15,23,42,0.85)',
                      border: '1px solid rgba(55,65,81,0.9)',
                      marginBottom: '0.7rem',
                    }}
                  >
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await fetch(`${API_URL}/clients/${selectedClientId}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(editingClient),
                        });
                        await fetchClients();
                        await fetchClientDetails(selectedClientId);
                      } catch {
                        alert("Erreur lors de la mise à jour du client.");
                      }
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '0.5rem 0.8rem',
                    }}
                  >
                    <label style={{ display: 'block' }}>
                      <span style={{ display: 'block', marginBottom: '0.15rem' }}>Nom</span>
                      <input
                        value={editingClient?.name || ''}
                        onChange={(e) =>
                          setEditingClient((prev) => ({ ...(prev || {}), name: e.target.value }))
                        }
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={{ display: 'block', marginBottom: '0.15rem' }}>Email</span>
                      <input
                        value={editingClient?.email || ''}
                        onChange={(e) =>
                          setEditingClient((prev) => ({ ...(prev || {}), email: e.target.value }))
                        }
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={{ display: 'block', marginBottom: '0.15rem' }}>Téléphone</span>
                      <input
                        value={editingClient?.phone || ''}
                        onChange={(e) =>
                          setEditingClient((prev) => ({ ...(prev || {}), phone: e.target.value }))
                        }
                      />
                    </label>
                    <label style={{ display: 'block' }}>
                      <span style={{ display: 'block', marginBottom: '0.15rem' }}>Statut</span>
                      <input
                        placeholder="ex: Gold, Famille…"
                        value={editingClient?.status || ''}
                        onChange={(e) =>
                          setEditingClient((prev) => ({ ...(prev || {}), status: e.target.value }))
                        }
                      />
                    </label>
                    <div style={{ gridColumn: '1 / -1', marginTop: '0.3rem' }}>
                      <button type="submit" style={{ fontSize: '0.78rem', padding: '0.35rem 1.1rem' }}>
                        Mettre à jour la fiche
                      </button>
                    </div>
                  </form>
                  </div>

                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Réservations :</strong>
                    {selectedClientDetails.reservations.length === 0 ? (
                      <span> aucune</span>
                    ) : (
                      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem' }}>
                        {selectedClientDetails.reservations.map((r) => (
                          <li key={r.id}>
                            #{r.id} · chambre {r.roomId} · {r.status}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div style={{ marginTop: '0.4rem' }}>
                    <strong>Logs associés :</strong>
                    {selectedClientDetails.logs.length === 0 ? (
                      <span> aucun</span>
                    ) : (
                      <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem', maxHeight: 80, overflowY: 'auto' }}>
                        {selectedClientDetails.logs.map((l, idx) => (
                          <li key={idx}>
                            {l.type} · chambre {l.roomId || '-'} · {new Date(l.time).toLocaleTimeString()}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Simulation d'applis smartphone (multi-téléphones) */}
              <div
                style={{
                  marginTop: '1.25rem',
                  borderTop: '1px solid rgba(55,65,81,0.8)',
                  paddingTop: '1.1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Simulation smartphones client</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                    <span style={{ color: '#6b7280' }}>Nombre de téléphones</span>
                    <select
                      value={phonesCount}
                      onChange={(e) => setPhonesCount(Number(e.target.value))}
                      style={{ borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${phonesCount}, minmax(0, 1fr))`,
                    gap: '0.8rem',
                  }}
                >
                  {Array.from({ length: phonesCount }).map((_, idx) => (
                    <div
                      key={idx}
                      style={{
                        margin: '0 auto',
                        maxWidth: 260,
                        borderRadius: '2rem',
                        padding: '1rem 1.1rem 1.3rem',
                        background:
                          'radial-gradient(circle at top, rgba(15,23,42,0.95), rgba(15,23,42,0.98))',
                        border: '1px solid rgba(55,65,81,0.9)',
                        boxShadow: '0 18px 40px rgba(15,23,42,0.9)',
                      }}
                    >
                      <div
                        style={{
                          width: 80,
                          height: 4,
                          borderRadius: 999,
                          backgroundColor: '#4b5563',
                          margin: '0 auto 0.8rem',
                        }}
                      />
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: '0.1rem' }}>
                        Smartphone {idx + 1}
                      </div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                        Clé numérique
                      </div>
                      <div
                        style={{
                          fontFamily: 'SF Mono, Menlo, ui-monospace',
                          fontSize: '0.78rem',
                          minHeight: 34,
                          borderRadius: '0.75rem',
                          padding: '0.45rem 0.6rem',
                          backgroundColor: 'rgba(15,23,42,0.9)',
                          border: '1px solid rgba(55,65,81,0.9)',
                          wordBreak: 'break-all',
                          color: lastToken ? '#e5e7eb' : '#6b7280',
                          marginBottom: '0.6rem',
                        }}
                      >
                        {lastToken || 'Aucune clé reçue pour le moment.'}
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePhoneAccess(idx)}
                        style={{
                          width: '100%',
                          justifyContent: 'center',
                        }}
                      >
                        Approcher du lecteur
                      </button>
                      {phoneStatuses[idx] && (
                        <p
                          style={{
                            marginTop: '0.6rem',
                            fontSize: '0.78rem',
                            color: phoneStatuses[idx].includes('autorisé') ? '#6ee7b7' : '#fca5a5',
                          }}
                        >
                          {phoneStatuses[idx]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'radial-gradient(circle at top, #020617, #020617)',
                borderRadius: '1.5rem',
                padding: '1.25rem 1.5rem',
                border: '1px solid rgba(55,65,81,0.8)',
                maxHeight: 260,
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
                  marginBottom: '0.4rem',
                }}
              >
                <h2 style={{ margin: 0, color: '#9ca3af' }}>Logs récents</h2>
                <button onClick={fetchLogs} style={{ paddingInline: '1rem', fontSize: '0.8rem' }}>
                  Rafraîchir
                </button>
              </div>
              <p style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                Historique des check-in et tentatives d'authentification.
              </p>
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  paddingRight: '0.2rem',
                }}
              >
                {logs.length === 0 && (
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
                  {logs.map((log, idx) => (
                    <li
                      key={idx}
                      style={{
                        padding: '0.35rem 0.5rem',
                        borderRadius: '0.75rem',
                        background: 'rgba(15,23,42,0.9)',
                        border: '1px solid rgba(31,41,55,0.8)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                        <span style={{ color: '#9ca3af' }}>{log.type}</span>
                        <span
                          style={{
                            color: log.success === false ? '#fca5a5' : '#6ee7b7',
                            fontWeight: 500,
                          }}
                        >
                          {log.success === false ? 'Échec' : 'OK'}
                        </span>
                      </div>
                      <div style={{ marginTop: '0.15rem', color: '#6b7280' }}>
                        Chambre {log.roomId || '-'} · {new Date(log.time).toLocaleTimeString()}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
