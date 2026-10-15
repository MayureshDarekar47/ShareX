import { useApp } from '../context/AppContext';

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

export default function Navbar() {
  const { isConnected, sessionToken, myDevice, theme, toggleTheme, isHost, hostPin, openNameSetup, isNameConfirmed } = useApp();

  const deviceName = myDevice?.name || 'Device';
  const statusText = sessionToken
    ? isConnected
      ? deviceName
      : 'Reconnecting...'
    : 'Not connected';

  const statusClass = sessionToken
    ? isConnected ? 'connected' : 'pairing'
    : 'disconnected';

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <div className="navbar-inner">
        <a href="/" className="navbar-logo">
          <img src="/favicon.svg" alt="ShareX" className="logo-icon-img" width="28" height="28" aria-hidden="true" />
          <span className="logo-text">ShareX</span>
          <span className="logo-tag">P2P</span>
        </a>

        <div className="navbar-actions">
          {/* Only show host PIN and device status if name setup is completed */}
          {isNameConfirmed && (
            <>
              {isHost && hostPin && (
                <div
                  className="navbar-pin-chip"
                  title="Your 6-digit session PIN"
                >
                  <span className="pin-label">PIN:</span>
                  <span className="pin-val">{hostPin}</span>
                </div>
              )}

              <button
                type="button"
                className="nav-status-btn"
                onClick={openNameSetup}
                title={`${statusText} — Click to rename device`}
                aria-label={`Current device: ${statusText}. Click to rename.`}
              >
                <span className={`status-dot ${statusClass}`} aria-hidden="true" />
                <span className="nav-status-text">{statusText}</span>
                <span className="nav-status-edit" aria-hidden="true">✏️</span>
              </button>
            </>
          )}

          <button
            id="theme-toggle"
            type="button"
            className="btn btn-ghost btn-icon theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </nav>
  );
}
