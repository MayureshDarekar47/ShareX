import { useState, useContext, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ToastContext } from '../main';
import { api } from '../api/client';

type Step = 'welcome' | 'name' | 'pin' | 'waiting' | 'host_view';

export default function PairingPage() {
  const { startPairing, submitPin, hostInfo, qrCode, qrUrl, pairingStep, pollPairStatus } = useApp();
  const { addToast } = useContext(ToastContext);

  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState(() => localStorage.getItem('sharex_device_name') || '');
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showHostView, setShowHostView] = useState(false);

  // Detect if this is likely the host (has host info loaded quickly, same origin)
  // Show host view option
  const [isHostMode, setIsHostMode] = useState(false);

  useEffect(() => {
    // If on same machine as server, offer host mode
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      setIsHostMode(true);
    }
  }, []);

  useEffect(() => {
    if (pairingStep === 'waiting') {
      setStep('waiting');
      const interval = setInterval(async () => {
        const done = await pollPairStatus();
        if (done) clearInterval(interval);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [pairingStep]);

  const handleStart = async () => {
    const defaultName = /iPhone|iPad/i.test(navigator.userAgent)
      ? 'iPhone'
      : /Android/i.test(navigator.userAgent)
      ? 'Android Device'
      : /Macintosh/i.test(navigator.userAgent)
      ? 'Mac'
      : /Windows/i.test(navigator.userAgent)
      ? 'Windows PC'
      : 'My Device';

    const finalName = name.trim() || defaultName;
    setName(finalName);
    setError('');
    setLoading(true);
    try {
      await startPairing(finalName);
      setStep('pin');
    } catch (e: any) {
      setError(e.message || 'Failed to start pairing');
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async () => {
    const pinStr = pin.join('');
    if (pinStr.length !== 6) { setError('Enter all 6 PIN digits'); return; }
    setError('');
    setLoading(true);
    try {
      const result = await submitPin(pinStr);
      if (!result.success) {
        setError(result.error || 'Incorrect PIN');
      } else if (result.waitingApproval) {
        setStep('waiting');
      }
    } catch (e: any) {
      setError(e.message || 'PIN verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (idx: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...pin];
    next[idx] = digit;
    setPin(next);
    if (digit && idx < 5) {
      document.getElementById(`pin-${idx + 1}`)?.focus();
    }
  };

  const handlePinKey = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[idx] && idx > 0) {
      document.getElementById(`pin-${idx - 1}`)?.focus();
    }
    if (e.key === 'Enter') handlePinSubmit();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setPin(text.split(''));
    }
  };

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast('success', 'URL copied!');
  };

  // ── Host view (server UI on localhost) ──
  if (showHostView) {
    return <HostView onBack={() => setShowHostView(false)} />;
  }

  return (
    <div className="pairing-container fade-in">
      {isHostMode && step === 'welcome' && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: '1rem' }}
          onClick={() => setShowHostView(true)}
          id="host-mode-btn"
        >
          📡 Host Server Dashboard
        </button>
      )}

      <div className="pairing-card">
        {/* ── Welcome ── */}
        {step === 'welcome' && (
          <div className="fade-in">
            <div className="pairing-header">
              <span className="pairing-icon">⚡</span>
              <h1 className="pairing-title">Welcome to ShareX</h1>
              <p className="pairing-subtitle">
                Fast, private, local file sharing.<br />No cloud. No signup. No ads.
              </p>
            </div>
            <div className="input-group mt-2">
              <label className="label" htmlFor="device-name">Your device name</label>
              <input
                id="device-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                placeholder="My Phone"
                maxLength={50}
                autoFocus
              />
            </div>
            {error && <p className="text-danger fs-sm mt-1" role="alert">{error}</p>}
            <button
              id="start-pairing-btn"
              className="btn btn-primary btn-full btn-lg mt-2"
              onClick={handleStart}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : '🔗 Connect to Host'}
            </button>
            <p className="text-center text-muted fs-xs mt-2">
              Make sure you're on the same Wi-Fi network as the host computer.
            </p>
          </div>
        )}

        {/* ── PIN entry ── */}
        {step === 'pin' && (
          <div className="fade-in">
            <div className="pairing-header">
              <span className="pairing-icon">🔐</span>
              <h2 className="pairing-title">Enter PIN</h2>
              <p className="pairing-subtitle">
                Enter the 6-digit PIN shown on the host computer.
              </p>
            </div>
            <div className="pin-input-group mt-2" onPaste={handlePaste}>
              {pin.map((digit, i) => (
                <input
                  key={i}
                  id={`pin-${i}`}
                  className="pin-digit"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinInput(i, e.target.value)}
                  onKeyDown={(e) => handlePinKey(i, e)}
                  autoFocus={i === 0}
                  aria-label={`PIN digit ${i + 1}`}
                />
              ))}
            </div>
            {error && <p className="text-danger fs-sm mt-1 text-center" role="alert">{error}</p>}
            <button
              id="submit-pin-btn"
              className="btn btn-primary btn-full mt-2"
              onClick={handlePinSubmit}
              disabled={loading || pin.some((d) => !d)}
            >
              {loading ? <span className="spinner" /> : 'Verify PIN'}
            </button>
            <button className="btn btn-ghost btn-full mt-1 fs-sm" onClick={() => { setStep('welcome'); setPin(['','','','','','']); setError(''); }}>
              ← Back
            </button>
          </div>
        )}

        {/* ── Waiting for approval ── */}
        {step === 'waiting' && (
          <div className="fade-in text-center">
            <div className="pairing-header">
              <span className="pairing-icon">⏳</span>
              <h2 className="pairing-title">Waiting for Approval</h2>
              <p className="pairing-subtitle">
                The host needs to approve your device.<br />Check the host computer.
              </p>
            </div>
            <div className="loading-overlay">
              <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
              <span>Waiting for host approval...</span>
            </div>
            <button className="btn btn-ghost btn-full mt-2 fs-sm" onClick={() => { setStep('welcome'); }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Connection help ── */}
      <div className="warning-banner mt-2">
        <span className="warning-icon">⚠️</span>
        <div>
          <strong>Can't connect?</strong> Ensure both devices are on the same Wi-Fi or hotspot.
          Check that the host firewall allows port {hostInfo?.port || 7788} on private networks.
        </div>
      </div>
    </div>
  );
}

// ── Host Dashboard (served on localhost) ──
function HostView({ onBack }: { onBack: () => void }) {
  const { hostInfo, qrCode, qrUrl, devices, pendingDevices, refreshDevices } = useApp();
  const { addToast } = useContext(ToastContext);
  const [hostToken] = useState(() => {
    // Host token from URL (for security) or localStorage
    const params = new URLSearchParams(window.location.search);
    return params.get('host_token') || localStorage.getItem('sharex_host_token') || '';
  });
  const [pin, setPin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Fetch the PIN from host-info (it's redacted; PIN is shown in terminal)
    // For the host UI, PIN is displayed via server console
  }, []);

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    addToast('success', 'URL copied to clipboard');
  };

  const handleApprove = async (deviceId: string, approve: boolean) => {
    const res = await api.approveDevice(deviceId, approve, hostToken);
    if (res.success) {
      addToast('success', approve ? 'Device approved' : 'Device rejected');
      refreshDevices();
    } else {
      addToast('error', res.error || 'Failed to approve');
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 700, margin: '1.5rem auto', padding: '0 1rem' }}>
      <button className="btn btn-ghost btn-sm mb-2" onClick={onBack}>← Client View</button>

      <h2 style={{ marginBottom: '1.5rem' }}>📡 Host Dashboard</h2>

      <div className="dashboard" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {/* QR & Addresses */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📱 Connect Devices</span>
          </div>
          <div className="card-body">
            <div className="qr-container">
              {qrCode ? (
                <img src={qrCode} alt="QR code to connect" className="qr-image" />
              ) : (
                <div className="loading-overlay"><div className="spinner" /></div>
              )}
              {qrUrl && (
                <button
                  id="copy-url-btn"
                  className={`qr-url copy-btn ${copied ? 'copied' : ''}`}
                  onClick={() => copyUrl(qrUrl)}
                  title="Click to copy URL"
                >
                  {qrUrl} {copied ? '✓' : '📋'}
                </button>
              )}
            </div>

            {hostInfo?.addresses && hostInfo.addresses.length > 0 && (
              <div className="address-list mt-2">
                {hostInfo.addresses.map((addr, i) => (
                  <div key={addr} className="address-item">
                    <span className="address-url">{addr}</span>
                    {i === 0 && <span className="address-badge">Primary</span>}
                    <button className="copy-btn" onClick={() => copyUrl(addr)}>📋</button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2">
              <p className="fs-xs text-muted">
                📌 PIN is displayed in the server terminal.<br />
                Devices must enter this PIN to connect.
              </p>
            </div>
          </div>
        </div>

        {/* Pending approvals & devices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {pendingDevices.length > 0 && (
            <div className="card glow-card">
              <div className="card-header">
                <span className="card-title">⏳ Awaiting Approval ({pendingDevices.length})</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {pendingDevices.map((d) => (
                  <div key={d.id} className="approval-panel">
                    <div className="approval-panel-title">📱 New Device Request</div>
                    <div className="approval-sender">{d.name} ({d.os})</div>
                    <div className="approval-actions">
                      <button
                        id={`approve-${d.id}`}
                        className="btn btn-primary btn-sm"
                        onClick={() => handleApprove(d.id, true)}
                      >
                        ✓ Approve
                      </button>
                      <button
                        id={`reject-${d.id}`}
                        className="btn btn-danger btn-sm"
                        onClick={() => handleApprove(d.id, false)}
                      >
                        ✗ Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <span className="card-title">🖥 Connected Devices ({devices.length})</span>
            </div>
            <div className="card-body">
              {devices.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📵</span>
                  <span className="empty-title">No devices connected</span>
                  <span className="empty-subtitle">Scan the QR code to connect</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {devices.map((d) => (
                    <div key={d.id} className="device-card" style={{ cursor: 'default' }}>
                      <div className="device-avatar">{getDeviceEmoji(d.os)}</div>
                      <div className="device-info">
                        <div className="device-name">{d.name}</div>
                        <div className="device-meta">{d.os} · {d.type}</div>
                      </div>
                      <div className="status-dot connected" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="warning-banner mt-2">
        <span className="warning-icon">🔒</span>
        <div>
          This server binds to <strong>0.0.0.0</strong> on your local network only.
          Files never leave your local network. Ensure your firewall blocks external access on port {hostInfo?.port || 7788}.
        </div>
      </div>
    </div>
  );
}

function getDeviceEmoji(os: string): string {
  switch (os) {
    case 'ios': return '🍎';
    case 'android': return '🤖';
    case 'windows': return '🖥';
    case 'linux': return '🐧';
    case 'macos': return '🍏';
    default: return '💻';
  }
}
