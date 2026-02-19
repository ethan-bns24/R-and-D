import ThemeToggle from '../ThemeToggle'

export default function LoginView({
  email,
  password,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}) {
  return (
    <div className="container login-shell">
      <section className="panel login-card">
        <header className="panel-header">
          <div>
            <h2>GRMS Backoffice</h2>
            <p>Connexion staff pour piloter les acces et portes en temps reel.</p>
          </div>
          <ThemeToggle />
        </header>

        <form className="panel-content form-grid" onSubmit={onSubmit}>
          <label>
            Email
            <input value={email} onChange={(e) => onEmailChange(e.target.value)} />
          </label>
          <label>
            Mot de passe
            <input type="password" value={password} onChange={(e) => onPasswordChange(e.target.value)} />
          </label>
          <div className="inline-actions">
            <button type="submit" className="primary-button">Connexion</button>
          </div>
        </form>

        {error ? <p className="error-text login-error">{error}</p> : null}
      </section>
    </div>
  )
}
