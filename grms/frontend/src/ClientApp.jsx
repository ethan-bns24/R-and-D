import { useState } from 'react';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:4000`
).replace(/\/+$/, '');

export default function ClientApp() {
  const [roomId, setRoomId] = useState('101');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!token || !roomId) {
      setStatus("Merci de renseigner la chambre et la clé.");
      return;
    }
    try {
      setIsLoading(true);
      setStatus('Vérification en cours…');
      const res = await fetch(`${API_URL}/tokens/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenValue: token, roomId: Number(roomId) }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("Accès autorisé – la porte s'ouvre (simulation).");
      } else {
        setStatus(`Accès refusé (${data.reason || 'erreur'}).`);
      }
    } catch (err) {
      setStatus("Erreur de connexion au GRMS.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, #020617 0%, #020617 35%, #020617 60%, #000 100%)',
        color: '#e5e7eb',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1.5rem 1rem',
      }}
    >
      <div
        style={{
          width: 360,
          maxWidth: '100%',
          borderRadius: '2.2rem',
          padding: '0.9rem 0.95rem 1.4rem',
          background:
            'linear-gradient(145deg, rgba(15,23,42,0.99), rgba(15,23,42,0.98))',
          border: '1px solid rgba(31,41,55,0.9)',
          boxShadow:
            '0 26px 60px rgba(15,23,42,0.9), 0 0 0 1px rgba(15,23,42,0.9)',
          position: 'relative',
        }}
      >
        {/* encoche / haut de téléphone */}
        <div
          style={{
            position: 'relative',
            marginBottom: '0.9rem',
          }}
        >
          <div
            style={{
              width: 110,
              height: 20,
              borderRadius: 999,
              backgroundColor: '#020617',
              margin: '0 auto',
              boxShadow: '0 0 0 1px rgba(15,23,42,1)',
            }}
          />
        </div>

        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.7rem',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#38bdf8',
                marginBottom: '0.15rem',
              }}
            >
              SmartRoom · Client
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>Ma clé de chambre</div>
          </div>
          <div
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              background: 'rgba(15,23,42,0.9)',
              border: '1px solid rgba(55,65,81,0.9)',
              fontSize: '0.7rem',
              color: '#9ca3af',
            }}
          >
            Chambre
            <span style={{ fontWeight: 600, color: '#e5e7eb', marginLeft: 4 }}>#{roomId || '---'}</span>
          </div>
        </header>

        <p
          style={{
            fontSize: '0.78rem',
            color: '#9ca3af',
            marginBottom: '0.9rem',
          }}
        >
          Colle ici la clé sécurisée reçue lors de ton check-in pour ouvrir la chambre sans contact.
        </p>

        <form
          onSubmit={handleVerify}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
        >
          <div>
            <label style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
              Numéro de chambre
              <input
                style={{
                  marginTop: '0.25rem',
                  width: '100%',
                  borderRadius: '0.9rem',
                  padding: '0.55rem 0.9rem',
                  border: '1px solid rgba(55,65,81,0.9)',
                  background: 'rgba(15,23,42,0.9)',
                  color: '#e5e7eb',
                }}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                inputMode="numeric"
              />
            </label>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
              Clé numérique
              <textarea
                style={{
                  marginTop: '0.25rem',
                  width: '100%',
                  minHeight: 80,
                  borderRadius: '0.9rem',
                  padding: '0.55rem 0.9rem',
                  border: '1px solid rgba(55,65,81,0.9)',
                  background: 'rgba(15,23,42,0.9)',
                  color: '#e5e7eb',
                  fontFamily: 'SF Mono, Menlo, ui-monospace',
                  fontSize: '0.8rem',
                }}
                placeholder="colle ici le token généré côté accueil"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: '0.1rem',
              borderRadius: '999px',
              padding: '0.65rem 1.3rem',
              border: '1px solid rgba(56,189,248,0.9)',
              background:
                'linear-gradient(135deg, rgba(8,47,73,0.98), rgba(14,165,233,0.98))',
              color: '#e0f2fe',
              fontWeight: 600,
              width: '100%',
              boxShadow: '0 14px 35px rgba(8,47,73,0.9)',
            }}
          >
            {isLoading ? 'Vérification…' : 'Approcher du lecteur'}
          </button>
        </form>

        {status && (
          <div
            style={{
              marginTop: '0.9rem',
              borderRadius: '0.9rem',
              padding: '0.55rem 0.75rem',
              background: status.includes('autorisé')
                ? 'rgba(22,163,74,0.2)'
                : 'rgba(185,28,28,0.22)',
              border: `1px solid ${status.includes('autorisé') ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,113,0.7)'}`,
              fontSize: '0.78rem',
              textAlign: 'center',
              color: status.includes('autorisé') ? '#bbf7d0' : '#fecaca',
            }}
          >
            {status}
          </div>
        )}

        <p
          style={{
            marginTop: '1rem',
            fontSize: '0.7rem',
            color: '#6b7280',
            textAlign: 'center',
          }}
        >
          Connectée au même GRMS que l'accueil. Toute ouverture ou erreur est visible dans les logs de
          la Smart Room.
        </p>
      </div>
    </div>
  );
}
