import { useApp } from '../context/AppContext';

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export default function Navbar() {
  const { isConnected, sessionToken, myDevice, theme, toggleTheme } = useApp();

  const statusText = sessionToken
    ? isConnected
      ? `Connected as ${myDevice?.name || 'Device'}`
      : 'Reconnecting...'
    : 'Not paired';

  const statusClass = sessionToken
    ? isConnected ? 'connected' : 'pairing'
    : 'disconnected';

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <div className="navbar-inner">
        <a href="/" className="navbar-logo">
          <img src="/favicon.svg" alt="" className="logo-icon-img" width="34" height="34" aria-hidden="true" />
          ShareX
        </a>

        <div className="navbar-actions">
          <div className="nav-status" aria-live="polite">
            <div className={`status-dot ${statusClass}`} aria-hidden="true" />
            <span>{statusText}</span>
          </div>

          <button
            id="theme-toggle"
            className="btn btn-ghost btn-icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </nav>
  );
}
