import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

function getSuggestedName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'My iPhone';
  if (/iPad/i.test(ua)) return 'My iPad';
  if (/Android/i.test(ua)) {
    const match = ua.match(/;\s*([^;)]+)\s+Build/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    return 'Android Phone';
  }
  if (/Windows/i.test(ua)) return 'Windows Laptop';
  if (/Macintosh/i.test(ua)) return 'MacBook';
  return 'My Device';
}

export default function NameSetupPage() {
  const { myDevice, confirmDeviceName } = useApp();
  const [name, setName] = useState<string>(() => {
    return (
      myDevice?.name ||
      localStorage.getItem('sharex_device_name') ||
      getSuggestedName()
    );
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      confirmDeviceName(name.trim());
    }
  };

  const suggestions = [
    { label: 'Laptop', icon: '💻' },
    { label: 'Mobile Phone', icon: '📱' },
    { label: 'Desktop PC', icon: '🖥' },
    { label: 'iPhone', icon: '🍎' },
    { label: 'Android Phone', icon: '🤖' },
  ];

  return (
    <div className="setup-container fade-in">
      <div className="setup-card">
        <div className="setup-header">
          <div className="setup-icon-bubble">
            <span className="setup-emoji">📡</span>
          </div>
          <h1 className="setup-title">Identify Your Device</h1>
          <p className="setup-subtitle">
            Enter a recognizable name so nearby phones &amp; laptops can discover you on the local network.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="setup-form">
          <div className="input-group">
            <label className="label" htmlFor="setup-device-name">
              Device Display Name
            </label>
            <input
              id="setup-device-name"
              className="input setup-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Laptop, Vivo Phone"
              maxLength={40}
              autoFocus
            />
          </div>

          <div className="presets-section">
            <span className="presets-label">Quick Suggestions</span>
            <div className="presets-grid">
              {suggestions.map((sug) => (
                <button
                  key={sug.label}
                  type="button"
                  className="preset-chip"
                  onClick={() => setName(sug.label)}
                >
                  <span className="preset-emoji">{sug.icon}</span>
                  <span>{sug.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full setup-submit-btn"
            id="start-connecting-btn"
            disabled={!name.trim()}
          >
            <span>Continue to ShareX</span>
            <span aria-hidden="true">→</span>
          </button>
        </form>
      </div>
    </div>
  );
}
