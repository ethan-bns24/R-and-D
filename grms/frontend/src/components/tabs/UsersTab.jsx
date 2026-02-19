export default function UsersTab({
  staff,
  clients,
  staffForm,
  clientForm,
  editStaff,
  editClient,
  onStaffFormChange,
  onClientFormChange,
  onEditStaffChange,
  onEditClientChange,
  onCreateStaff,
  onUpdateStaff,
  onDeleteStaff,
  onCreateClient,
  onUpdateClient,
  onDeleteClient,
  onCancelEditStaff,
  onCancelEditClient,
  onStartEditStaff,
  onStartEditClient,
}) {
  return (
    <section className="grid two">
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Staff</h2>
            <p>Gestion des comptes staff et roles.</p>
          </div>
        </header>
        <div className="panel-content">
          <form onSubmit={onCreateStaff} className="inline-form">
            <input placeholder="email" value={staffForm.email} onChange={(e) => onStaffFormChange({ ...staffForm, email: e.target.value })} />
            <input type="password" placeholder="password" value={staffForm.password} onChange={(e) => onStaffFormChange({ ...staffForm, password: e.target.value })} />
            <select value={staffForm.role} onChange={(e) => onStaffFormChange({ ...staffForm, role: e.target.value })}>
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
            <button type="submit" className="primary-button">Ajouter</button>
          </form>

          {editStaff ? (
            <form onSubmit={onUpdateStaff} className="inline-form edit-box">
              <input value={editStaff.email} onChange={(e) => onEditStaffChange({ ...editStaff, email: e.target.value })} />
              <input type="password" placeholder="new password" value={editStaff.password || ''} onChange={(e) => onEditStaffChange({ ...editStaff, password: e.target.value })} />
              <select value={editStaff.role} onChange={(e) => onEditStaffChange({ ...editStaff, role: e.target.value })}>
                <option value="staff">staff</option>
                <option value="admin">admin</option>
              </select>
              <div className="row">
                <button type="submit" className="primary-button">Enregistrer</button>
                <button type="button" className="ghost-button" onClick={onCancelEditStaff}>Annuler</button>
              </div>
            </form>
          ) : null}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Actif</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((item) => (
                  <tr key={item.staff_id}>
                    <td>{item.email}</td>
                    <td>{item.role}</td>
                    <td>{item.is_active ? 'oui' : 'non'}</td>
                    <td className="row">
                      <button className="ghost-button" onClick={() => onStartEditStaff(item)}>Modifier</button>
                      <button className="danger-button" onClick={() => onDeleteStaff(item.staff_id)}>Supprimer</button>
                    </td>
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
            <h2>Clients</h2>
            <p>Gestion des comptes clients de l hotel.</p>
          </div>
        </header>
        <div className="panel-content">
          <form onSubmit={onCreateClient} className="inline-form">
            <input placeholder="nom" value={clientForm.name} onChange={(e) => onClientFormChange({ ...clientForm, name: e.target.value })} />
            <input placeholder="email" value={clientForm.email} onChange={(e) => onClientFormChange({ ...clientForm, email: e.target.value })} />
            <input type="password" placeholder="password" value={clientForm.password} onChange={(e) => onClientFormChange({ ...clientForm, password: e.target.value })} />
            <button type="submit" className="primary-button">Ajouter</button>
          </form>

          {editClient ? (
            <form onSubmit={onUpdateClient} className="inline-form edit-box">
              <input value={editClient.name} onChange={(e) => onEditClientChange({ ...editClient, name: e.target.value })} />
              <input value={editClient.email} onChange={(e) => onEditClientChange({ ...editClient, email: e.target.value })} />
              <input type="password" placeholder="new password" value={editClient.password || ''} onChange={(e) => onEditClientChange({ ...editClient, password: e.target.value })} />
              <div className="row">
                <button type="submit" className="primary-button">Enregistrer</button>
                <button type="button" className="ghost-button" onClick={onCancelEditClient}>Annuler</button>
              </div>
            </form>
          ) : null}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Actif</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((item) => (
                  <tr key={item.user_id}>
                    <td>{item.name}</td>
                    <td>{item.email}</td>
                    <td>{item.is_active ? 'oui' : 'non'}</td>
                    <td className="row">
                      <button className="ghost-button" onClick={() => onStartEditClient(item)}>Modifier</button>
                      <button className="danger-button" onClick={() => onDeleteClient(item.user_id)}>Supprimer</button>
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
