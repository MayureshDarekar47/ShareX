import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function NameSetupPage() {
  const { myDevice, confirmDeviceName } = useApp();
  const [name, setName] = useState(
    myDevice?.name || localStorage.getItem('sharex_device_name') || ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      confirmDeviceName(name.trim());
    }
  };

  return (
    <div className="pairing-container fade-in" style={{ maxWidth: 440, margin: '2.5rem auto', padding: '0 1rem' }}>
      <div className="pairing-card">
        <div className="pairing-header">
          <span className="pairing-icon">⚡</span>
          <h1 className="pairing-title">Welcome to ShareX</h1>
          <p className="pairing-subtitle">
            Enter your device name so other devices can recognize and connect with you.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
          <div className="input-group">
            <label className="label" htmlFor="setup-device-name">Device Name</label>
            <input
              id="setup-device-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mayuresh Phone, Vivo Y50, Work Laptop"
              maxLength={40}
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            id="start-connecting-btn"
            disabled={!name.trim()}
          >
            🚀 Continue & Discover Devices
          </button>
        </form>
      </div>
    </div>
  );
}
