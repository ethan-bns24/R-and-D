import ThemeToggle from '../ThemeToggle'
import { TABS } from '../../constants/tabs'

export default function HeaderBar({
  ping,
  stats,
  staffCount,
  clientCount,
  activeTab,
  onTabChange,
  onRefresh,
  onLogout,
}) {
  const pingClass = ping.ok ? 'online' : ping.ok === false ? 'offline' : 'degraded'
  const pingLabel = ping.ok ? `${ping.ms} ms` : ping.ok === false ? 'offline' : '...'

  return (
    <>
      <header className="app-header compact">
        <div>
          <h1>GRMS - Gestion Hotel</h1>
          <p className="muted">Interface staff complete</p>
        </div>
        <div className="header-right">
          <div className="backend-ping" title="Backend reachability">
            <span className={`ping-dot ${pingClass}`} />
            <span>Backend {pingLabel}</span>
          </div>
          <ThemeToggle />
          <button className="ghost-button" onClick={onRefresh}>Rafraichir</button>
          <button className="ghost-button" onClick={onLogout}>Deconnexion</button>
        </div>
      </header>

      <section className="panel">
        <div className="stats-grid">
          <article className="stat-card">
            <span>Portes connectees</span>
            <strong>{stats.connected}/{stats.totalDoors}</strong>
          </article>
          <article className="stat-card">
            <span>Staff</span>
            <strong>{staffCount}</strong>
          </article>
          <article className="stat-card">
            <span>Clients</span>
            <strong>{clientCount}</strong>
          </article>
          <article className="stat-card">
            <span>Acces actifs</span>
            <strong>{stats.activeGrants}</strong>
          </article>
          <article className="stat-card">
            <span>Events OK/KO</span>
            <strong>{stats.success}/{stats.fail}</strong>
          </article>
        </div>

        <nav className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </section>
    </>
  )
}
