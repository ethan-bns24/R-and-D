import { fmtTs, shortId } from '../../utils/format'

export default function DashboardTab({ doors, events }) {
  return (
    <section className="grid two">
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Portes</h2>
            <p>Etat des portes et presence websocket.</p>
          </div>
        </header>
        <div className="panel-content">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Door</th>
                  <th>BLE</th>
                  <th>WS</th>
                  <th>Seen</th>
                </tr>
              </thead>
              <tbody>
                {doors.map((door) => (
                  <tr key={door.door_id}>
                    <td>{door.room_label}</td>
                    <td className="mono">{shortId(door.door_id)}</td>
                    <td className="mono">{door.ble_id}</td>
                    <td>
                      <span className={`badge ${door.connected ? 'ok' : 'ko'}`}>
                        {door.connected ? 'online' : 'offline'}
                      </span>
                    </td>
                    <td>{fmtTs(door.last_seen_ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Derniers events</h2>
            <p>Dernieres tentatives d acces remontees par les portes.</p>
          </div>
        </header>
        <div className="panel-content">
          <div className="event-list">
            {events.slice(0, 12).map((event) => (
              <article key={event.event_id} className="event-item">
                <div className="row spread">
                  <strong>{event.result === 'success' ? 'Ouverture OK' : 'Ouverture KO'}</strong>
                  <span className={`badge ${event.result === 'success' ? 'ok' : 'ko'}`}>{event.result}</span>
                </div>
                <p className="muted">{fmtTs(event.ts)} - Porte <span className="mono">{shortId(event.door_id)}</span></p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </section>
  )
}
