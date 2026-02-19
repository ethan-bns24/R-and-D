import { fmtTs, shortId } from '../../utils/format'

export default function EventsTab({ events }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Evenements</h2>
          <p>Historique des ouvertures et echecs remontes par les portes.</p>
        </div>
      </header>
      <div className="panel-content">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Door</th>
                <th>Result</th>
                <th>Error</th>
                <th>Key</th>
                <th>Grant</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.event_id}>
                  <td>{fmtTs(event.ts)}</td>
                  <td className="mono">{shortId(event.door_id)}</td>
                  <td>
                    <span className={`badge ${event.result === 'success' ? 'ok' : 'ko'}`}>{event.result}</span>
                  </td>
                  <td>{event.error_code}</td>
                  <td className="mono">{shortId(event.key_id)}</td>
                  <td className="mono">{shortId(event.grant_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
