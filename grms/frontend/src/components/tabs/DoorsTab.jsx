export default function DoorsTab({
  doors,
  doorForm,
  editDoor,
  onDoorFormChange,
  onCreateDoor,
  onEditDoorChange,
  onUpdateDoor,
  onDeleteDoor,
  onStartEditDoor,
  onCancelEditDoor,
}) {
  return (
    <section className="grid">
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Ajouter une porte</h2>
            <p>Creation d une nouvelle porte rattachee a une chambre.</p>
          </div>
        </header>
        <div className="panel-content">
          <form onSubmit={onCreateDoor} className="grid door-form-grid">
            <input placeholder="door_id" value={doorForm.door_id} onChange={(e) => onDoorFormChange({ ...doorForm, door_id: e.target.value })} />
            <input placeholder="room_id" value={doorForm.room_id} onChange={(e) => onDoorFormChange({ ...doorForm, room_id: e.target.value })} />
            <input placeholder="room_label" value={doorForm.room_label} onChange={(e) => onDoorFormChange({ ...doorForm, room_label: e.target.value })} />
            <input placeholder="ble_id" value={doorForm.ble_id} onChange={(e) => onDoorFormChange({ ...doorForm, ble_id: e.target.value })} />
            <button type="submit" className="primary-button">Creer</button>
          </form>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Portes</h2>
            <p>Catalogue des portes, etat websocket et actions.</p>
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {doors.map((door) => (
                  <tr key={door.door_id}>
                    <td>{door.room_id}</td>
                    <td className="mono">{door.door_id}</td>
                    <td className="mono">{door.ble_id}</td>
                    <td>
                      <span className={`badge ${door.connected ? 'ok' : 'ko'}`}>
                        {door.connected ? 'online' : 'offline'}
                      </span>
                    </td>
                    <td className="row">
                      <button className="ghost-button" onClick={() => onStartEditDoor(door)}>Modifier</button>
                      <button className="danger-button" onClick={() => onDeleteDoor(door.door_id)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {editDoor ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Modifier porte {editDoor.door_id}</h2>
              <p>Mise a jour de la chambre ou du BLE ID.</p>
            </div>
          </header>
          <div className="panel-content">
            <form onSubmit={onUpdateDoor} className="grid door-form-grid">
              <input value={editDoor.room_id} onChange={(e) => onEditDoorChange({ ...editDoor, room_id: e.target.value })} />
              <input value={editDoor.room_label} onChange={(e) => onEditDoorChange({ ...editDoor, room_label: e.target.value })} />
              <input value={editDoor.ble_id} onChange={(e) => onEditDoorChange({ ...editDoor, ble_id: e.target.value })} />
              <div className="row">
                <button type="submit" className="primary-button">Enregistrer</button>
                <button type="button" className="ghost-button" onClick={onCancelEditDoor}>Annuler</button>
              </div>
            </form>
          </div>
        </section>
      ) : null}
    </section>
  )
}
