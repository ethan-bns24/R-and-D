import { shortId } from '../../utils/format'

export default function AccessTab({
  clients,
  rooms,
  grants,
  assignForm,
  onAssignFormChange,
  onAssign,
  onRevoke,
}) {
  return (
    <section className="grid two">
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Assigner un acces</h2>
            <p>Associer un client a une chambre sur une duree precise.</p>
          </div>
        </header>
        <form onSubmit={onAssign} className="panel-content">
          <label>
            Client
            <select value={assignForm.user_email} onChange={(e) => onAssignFormChange({ ...assignForm, user_email: e.target.value })}>
              {clients.map((client) => (
                <option key={client.user_id} value={client.email}>
                  {client.name} - {client.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chambre
            <select value={assignForm.room_id} onChange={(e) => onAssignFormChange({ ...assignForm, room_id: e.target.value })}>
              {rooms.map((room) => (
                <option key={room.room_id} value={room.room_id}>
                  {room.room_id} - {room.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Debut
            <input type="datetime-local" value={assignForm.from_local} onChange={(e) => onAssignFormChange({ ...assignForm, from_local: e.target.value })} />
          </label>
          <label>
            Fin
            <input type="datetime-local" value={assignForm.to_local} onChange={(e) => onAssignFormChange({ ...assignForm, to_local: e.target.value })} />
          </label>
          <div className="row top-gap">
            <button type="submit" className="primary-button">Assigner</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Grants</h2>
            <p>Droits actifs et historiques d attribution.</p>
          </div>
        </header>
        <div className="panel-content">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Grant</th>
                  <th>Client</th>
                  <th>Room</th>
                  <th>Porte</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((grant) => (
                  <tr key={`${grant.grant_id}-${grant.door_id}`}>
                    <td className="mono">{shortId(grant.grant_id)}</td>
                    <td>{grant.user_email}</td>
                    <td>{grant.room_id}</td>
                    <td className="mono">{shortId(grant.door_id)}</td>
                    <td>
                      <span className={`badge ${grant.status === 'active' ? 'ok' : 'ko'}`}>{grant.status}</span>
                    </td>
                    <td>
                      <button
                        className="danger-button"
                        disabled={grant.status !== 'active'}
                        onClick={() => onRevoke(grant.grant_id)}
                      >
                        Revoquer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  )
}
