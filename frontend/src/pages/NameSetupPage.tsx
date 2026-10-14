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
  const { myDevice, confirmDeviceName, isNameConfirmed } = useApp();
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
    '💻 Laptop',
    '📱 Mobile Phone',
    '🖥 Desktop PC',
    '🍎 iPhone',
    '🤖 Vivo / Android',
  ];

  return (
    <div className="pairing-container fade-in" style={{ maxWidth: 460, margin: '2rem auto', padding: '0 1rem' }}>
      <div className="pairing-card" style={{ border: '2px solid var(--accent-primary)', boxShadow: '0 10px 40px rgba(99, 102, 241, 0.25)' }}>
        <div className="pairing-header" style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              margin: '0 auto 1rem',
              boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
            }}
          >
            📡
          </div>
          <h1 className="pairing-title" style={{ fontSize: '1.5rem', fontWeight: 800 }}>
            Choose Your Device Name
          </h1>
          <p className="pairing-subtitle" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Enter a recognizable name so nearby phones & laptops know who is sending or receiving files.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
          <div className="input-group">
            <label className="label" htmlFor="setup-device-name" style={{ fontWeight: 600 }}>
              Device Name
            </label>
            <input
              id="setup-device-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mayuresh Laptop, Vivo Y50"
              maxLength={40}
              autoFocus
              style={{
                fontSize: '1.05rem',
                padding: '0.85rem 1rem',
                border: '2px solid var(--border-default)',
                borderRadius: '10px',
              }}
            />
          </div>

          <div>
            <span className="fs-xs text-muted" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
              Quick Suggestions:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {suggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setName(sug.replace(/^[^\w\s]+\s*/, ''))}
                  style={{
                    fontSize: '0.78rem',
                    padding: '0.3rem 0.6rem',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '20px',
                  }}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              id="start-connecting-btn"
              disabled={!name.trim()}
              style={{ fontWeight: 700, fontSize: '1.05rem' }}
            >
              🚀 Continue & Discover Devices
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
