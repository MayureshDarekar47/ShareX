import { useState, useRef, useCallback, useContext } from 'react';
import { useApp } from '../context/AppContext';
import { ToastContext } from '../main';
import { ActiveTransfer, Device } from '../types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function getFileEmoji(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','heic','avif'].includes(ext)) return '🖼';
  if (['mp4','mov','avi','mkv','webm'].includes(ext)) return '🎬';
  if (['mp3','wav','flac','aac','ogg','m4a'].includes(ext)) return '🎵';
  if (['pdf'].includes(ext)) return '📄';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['xls','xlsx'].includes(ext)) return '📊';
  if (['ppt','pptx'].includes(ext)) return '📊';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return '📦';
  if (['apk'].includes(ext)) return '📱';
  return '📁';
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

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'uploading': case 'relaying': return 'badge-uploading';
    case 'completed': return 'badge-completed';
    case 'failed': return 'badge-failed';
    case 'cancelled': return 'badge-cancelled';
    case 'waiting_approval': return 'badge-waiting';
    default: return 'badge-pending';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'uploading': return '↑ Uploading';
    case 'relaying': return '⇄ Relaying';
    case 'completed': return '✓ Done';
    case 'failed': return '✗ Failed';
    case 'cancelled': return '– Cancelled';
    case 'waiting_approval': return '⏳ Awaiting';
    case 'approved': return '→ Starting';
    default: return status;
  }
}

// ── Transfer Card ──
function TransferCard({ transfer }: { transfer: ActiveTransfer }) {
  const { cancelTransfer, retryTransfer, downloadFile, approveIncomingTransfer } = useApp();
  const { addToast } = useContext(ToastContext);
  const totalSize = transfer.fileInfos.reduce((s, f) => s + f.size, 0);

  const handleDownload = (i: number) => {
    downloadFile(transfer.transferId, i, transfer.fileInfos[i].name);
    addToast('info', `Downloading ${transfer.fileInfos[i].name}...`);
  };

  return (
    <div className={`transfer-card ${transfer.status}`}>
      <div className="transfer-header">
        <div>
          <div className="transfer-files">
            {transfer.fileInfos.length === 1
              ? transfer.fileInfos[0].name
              : `${transfer.fileInfos.length} files`}
          </div>
          <div className="transfer-size">
            {formatBytes(totalSize)}
            {transfer.direction === 'receive' && transfer.senderName && (
              <> · From: <strong>{transfer.senderName}</strong></>
            )}
          </div>
        </div>
        <span className={`transfer-status-badge ${getStatusBadgeClass(transfer.status)}`}>
          {getStatusLabel(transfer.status)}
        </span>
      </div>

      {/* Incoming approval */}
      {transfer.direction === 'receive' && transfer.status === 'waiting_approval' && (
        <div className="approval-actions mb-1" style={{ marginBottom: '0.75rem' }}>
          <button
            id={`approve-transfer-${transfer.transferId}`}
            className="btn btn-primary btn-sm"
            onClick={() => approveIncomingTransfer(transfer.transferId, true)}
          >
            ✓ Accept
          </button>
          <button
            id={`reject-transfer-${transfer.transferId}`}
            className="btn btn-danger btn-sm"
            onClick={() => approveIncomingTransfer(transfer.transferId, false)}
          >
            ✗ Decline
          </button>
        </div>
      )}

      {/* Progress bar */}
      {['uploading', 'relaying', 'approved'].includes(transfer.status) && (
        <>
          <div className="progress-bar" aria-label={`Transfer progress: ${transfer.progress}%`}>
            <div className="progress-fill" style={{ width: `${transfer.progress}%` }} />
          </div>
          <div className="transfer-stats">
            <span>{transfer.progress}%</span>
            {transfer.speed > 0 && <span>{formatSpeed(transfer.speed)}</span>}
            {transfer.eta > 0 && <span>~{formatEta(transfer.eta)}</span>}
          </div>
        </>
      )}

      {/* Error message */}
      {transfer.status === 'failed' && transfer.error && (
        <p className="text-danger fs-xs mt-1">{transfer.error}</p>
      )}

      {/* File list with download buttons */}
      {transfer.status === 'completed' && (
        <ul className="file-list mt-1">
          {transfer.fileInfos.map((f, i) => (
            <li key={i} className="file-item">
              <span className="file-icon">{getFileEmoji(f.name)}</span>
              <div className="file-details">
                <div className="file-name" title={f.name}>{f.name}</div>
                <div className="file-size">{formatBytes(f.size)}</div>
              </div>
              {(transfer.direction === 'receive' || transfer.receiverId === 'host') && (
                <button
                  id={`download-${transfer.transferId}-${i}`}
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDownload(i)}
                  aria-label={`Download ${f.name}`}
                >
                  ↓ Save
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Actions */}
      <div className="flex gap-1 mt-1" style={{ flexWrap: 'wrap' }}>
        {['uploading', 'waiting_approval', 'approved', 'relaying'].includes(transfer.status) && (
          <button
            id={`cancel-${transfer.id}`}
            className="btn btn-danger btn-sm"
            onClick={() => cancelTransfer(transfer.id)}
          >
            Cancel
          </button>
        )}
        {transfer.status === 'failed' && transfer.files.length > 0 && (
          <button
            id={`retry-${transfer.id}`}
            className="btn btn-secondary btn-sm"
            onClick={() => retryTransfer(transfer.id)}
          >
            ↺ Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ── Send Files Panel ──
function SendPanel() {
  const { devices, myDevice, sendFiles } = useApp();
  const { addToast } = useContext(ToastContext);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedReceiver, setSelectedReceiver] = useState<string>('host');
  const [dragOver, setDragOver] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSize = selectedFiles.reduce((s, f) => s + f.size, 0);

  const addFiles = useCallback((newFiles: File[]) => {
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...newFiles.filter((f) => !existing.has(f.name + f.size))];
    });
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files);
  };

  const handleSend = async () => {
    if (!selectedFiles.length) { addToast('error', 'Select at least one file'); return; }
    setSending(true);
    try {
      await sendFiles(selectedReceiver, selectedFiles);
      setSelectedFiles([]);
      addToast('success', 'Transfer started!');
    } catch (e: any) {
      addToast('error', e.message || 'Failed to start transfer');
    } finally {
      setSending(false);
    }
  };

  const otherDevices = devices.filter((d) => d.id !== myDevice?.id);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">📤 Send Files</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Receiver selector */}
        <div className="input-group">
          <label className="label">Send to</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div
              className={`device-card ${selectedReceiver === 'host' ? 'selected' : ''}`}
              onClick={() => setSelectedReceiver('host')}
              id="receiver-host"
              role="radio"
              aria-checked={selectedReceiver === 'host'}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSelectedReceiver('host')}
            >
              <div className="device-avatar">🖥</div>
              <div className="device-info">
                <div className="device-name">Host Computer</div>
                <div className="device-meta">Save to received folder</div>
              </div>
              {selectedReceiver === 'host' && <span style={{ color: 'var(--accent-primary)' }}>✓</span>}
            </div>

            {otherDevices.map((d) => (
              <div
                key={d.id}
                className={`device-card ${selectedReceiver === d.id ? 'selected' : ''}`}
                onClick={() => setSelectedReceiver(d.id)}
                id={`receiver-${d.id}`}
                role="radio"
                aria-checked={selectedReceiver === d.id}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedReceiver(d.id)}
              >
                <div className="device-avatar">{getDeviceEmoji(d.os)}</div>
                <div className="device-info">
                  <div className="device-name">{d.name}</div>
                  <div className="device-meta">{d.os} · {d.type}</div>
                </div>
                {selectedReceiver === d.id && <span style={{ color: 'var(--accent-primary)' }}>✓</span>}
              </div>
            ))}

            {otherDevices.length === 0 && (
              <p className="text-muted fs-xs">No other devices connected. Only host transfer available.</p>
            )}
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          aria-label="Drop files here or click to select"
          id="drop-zone"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          <span className="drop-icon">📂</span>
          <div className="drop-title">Drop files here</div>
          <div className="drop-subtitle">or click to select · Any file type</div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => addFiles(Array.from(e.target.files || []))}
            style={{ display: 'none' }}
            id="file-input"
            aria-label="Select files to send"
          />
        </div>

        {/* File list */}
        {selectedFiles.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="label">{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} · {formatBytes(totalSize)}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedFiles([])}>Clear</button>
            </div>
            <ul className="file-list">
              {selectedFiles.map((f, i) => (
                <li key={i} className="file-item">
                  <span className="file-icon">{getFileEmoji(f.name)}</span>
                  <div className="file-details">
                    <div className="file-name" title={f.name}>{f.name}</div>
                    <div className="file-size">{formatBytes(f.size)}</div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelectedFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove ${f.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          id="send-btn"
          className="btn btn-primary btn-full btn-lg"
          onClick={handleSend}
          disabled={sending || selectedFiles.length === 0}
        >
          {sending ? <><span className="spinner" /> Sending...</> : '⚡ Send Files'}
        </button>
      </div>
    </div>
  );
}

// ── Active Transfers ──
function TransfersPanel() {
  const { activeTransfers } = useApp();

  if (activeTransfers.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">⇄ Active Transfers</span>
        </div>
        <div className="card-body">
          <div className="empty-state">
            <span className="empty-icon">🔄</span>
            <span className="empty-title">No active transfers</span>
            <span className="empty-subtitle">Send or receive files to see progress here</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">⇄ Active Transfers ({activeTransfers.length})</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {activeTransfers.map((t) => (
          <TransferCard key={t.id} transfer={t} />
        ))}
      </div>
    </div>
  );
}

// ── Devices Panel ──
function DevicesPanel() {
  const { devices, myDevice, renameDevice, refreshDevices } = useApp();
  const { addToast } = useContext(ToastContext);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await renameDevice(id, editName.trim());
    addToast('success', 'Device renamed');
    setEditingId(null);
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">🖥 Devices ({devices.length})</span>
        <button className="btn btn-ghost btn-sm" onClick={refreshDevices} id="refresh-devices-btn">↺ Refresh</button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {devices.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📵</span>
            <span className="empty-title">Only you're connected</span>
          </div>
        ) : (
          devices.map((d) => (
            <div key={d.id} className="device-card" style={{ cursor: 'default' }}>
              <div className="device-avatar">{getDeviceEmoji(d.os)}</div>
              <div className="device-info">
                {editingId === d.id ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(d.id); if (e.key === 'Escape') setEditingId(null); }}
                      autoFocus
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                      id={`rename-input-${d.id}`}
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => handleRename(d.id)}>✓</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    <div className="device-name">
                      {d.name}
                      {d.id === myDevice?.id && <span className="fs-xs text-muted"> (you)</span>}
                    </div>
                    <div className="device-meta">{d.os} · {d.type}</div>
                  </>
                )}
              </div>
              {editingId !== d.id && d.id === myDevice?.id && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setEditingId(d.id); setEditName(d.name); }}
                  id={`rename-device-${d.id}`}
                  aria-label="Rename device"
                >
                  ✏
                </button>
              )}
              <div className="status-dot connected" title="Online" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── History Panel ──
function HistoryPanel() {
  const { transferHistory, clearHistory } = useApp();
  const { addToast } = useContext(ToastContext);

  const handleClear = async () => {
    await clearHistory();
    addToast('info', 'History cleared');
  };

  if (transferHistory.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">📋 Transfer History</span>
        </div>
        <div className="card-body">
          <div className="empty-state">
            <span className="empty-icon">📋</span>
            <span className="empty-title">No transfer history</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">📋 Transfer History ({transferHistory.length})</span>
        <button className="btn btn-danger btn-sm" onClick={handleClear} id="clear-history-btn">
          🗑 Clear
        </button>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 300, overflowY: 'auto' }}>
        {transferHistory.map((t: any) => {
          const totalSize = t.files?.reduce((s: number, f: any) => s + f.size, 0) || 0;
          const date = new Date(t.createdAt);
          return (
            <div key={t.id} className={`transfer-card ${t.status}`}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="transfer-files fs-sm">
                    {t.files?.length === 1 ? t.files[0].name : `${t.files?.length || 0} files`}
                  </div>
                  <div className="transfer-size">
                    {formatBytes(totalSize)} · {date.toLocaleString()}
                  </div>
                </div>
                <span className={`transfer-status-badge ${getStatusBadgeClass(t.status)}`}>
                  {getStatusLabel(t.status)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dashboard page ──
export default function DashboardPage() {
  const { hostInfo, qrCode, qrUrl, myDevice, isHost, hostPin, pendingDevices, approveDeviceRequest } = useApp();
  const { addToast } = useContext(ToastContext);
  const [activeTab, setActiveTab] = useState<'send' | 'devices' | 'history'>('send');
  const [copied, setCopied] = useState(false);

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    addToast('success', 'URL copied!');
  };

  return (
    <div className="fade-in" style={{ paddingTop: '1.5rem' }}>
      {/* Pending approvals alert banner for host */}
      {pendingDevices && pendingDevices.length > 0 && (
        <div className="card glow-card mb-2" style={{ border: '2px solid var(--accent, #6366f1)' }}>
          <div className="card-header" style={{ background: 'rgba(99, 102, 241, 0.12)' }}>
            <span className="card-title" style={{ color: 'var(--primary, #6366f1)' }}>
              🔔 Device Connection Requests ({pendingDevices.length})
            </span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingDevices.map((d) => (
              <div
                key={d.id}
                className="approval-panel"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '0.75rem 1rem',
                  borderRadius: 8,
                }}
              >
                <div>
                  <div className="approval-sender" style={{ fontWeight: 600 }}>📱 {d.name}</div>
                  <div className="text-muted fs-xs">{d.os} · {d.type}</div>
                </div>
                <div className="approval-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      approveDeviceRequest(d.id, true);
                      addToast('success', `Approved ${d.name}`);
                    }}
                    id={`approve-${d.id}`}
                  >
                    ✓ Approve
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      approveDeviceRequest(d.id, false);
                      addToast('info', `Rejected ${d.name}`);
                    }}
                    id={`reject-${d.id}`}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'send' ? 'active' : ''}`} onClick={() => setActiveTab('send')} id="tab-send">
          📤 Send / Receive
        </button>
        <button className={`tab-btn ${activeTab === 'devices' ? 'active' : ''}`} onClick={() => setActiveTab('devices')} id="tab-devices">
          🖥 Devices
        </button>
        <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')} id="tab-history">
          📋 History
        </button>
      </div>

      {activeTab === 'send' && (
        <div className="dashboard">
          <div className="dashboard-col">
            <SendPanel />
          </div>
          <div className="dashboard-col">
            <TransfersPanel />

            {/* Quick connect card */}
            {(isHost || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">📱 Connect Other Devices</span>
                </div>
                <div className="card-body">
                  <div className="qr-container">
                    {qrCode ? (
                      <img src={qrCode} alt="QR code to connect devices" className="qr-image" />
                    ) : (
                      <div className="loading-overlay"><div className="spinner" /></div>
                    )}
                    {qrUrl && (
                      <button
                        id="copy-qr-url-btn"
                        className={`qr-url copy-btn ${copied ? 'copied' : ''}`}
                        onClick={() => copyUrl(qrUrl)}
                        title="Click to copy"
                      >
                        {qrUrl} {copied ? '✓' : '📋'}
                      </button>
                    )}
                    <p className="text-muted fs-xs text-center">
                      Scan with phone camera or open URL in mobile browser
                    </p>
                  </div>

                  {hostPin && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: 8, border: '1px solid rgba(99, 102, 241, 0.3)', textAlign: 'center' }}>
                      <div className="fs-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                        Pairing PIN
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--primary, #818cf8)', margin: '0.25rem 0' }}>
                        {hostPin}
                      </div>
                      <div className="fs-xs text-muted">
                        Connecting devices enter this 6-digit PIN to pair
                      </div>
                    </div>
                  )}

                  {hostInfo?.addresses && (
                    <div className="address-list mt-2">
                      {hostInfo.addresses.slice(0, 3).map((addr, i) => (
                        <div key={addr} className="address-item">
                          <span className="address-url">{addr}</span>
                          {i === 0 && <span className="address-badge">Primary</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'devices' && (
        <div style={{ maxWidth: 600 }}>
          <DevicesPanel />
        </div>
      )}

      {activeTab === 'history' && (
        <div style={{ maxWidth: 700 }}>
          <HistoryPanel />
        </div>
      )}

      <div className="warning-banner mt-2">
        <span className="warning-icon">ℹ️</span>
        <div className="fs-xs">
          All transfers stay on your local network. <strong>Safari on iOS</strong> may prompt to save files differently.
          Background transfers are limited by the browser — keep this tab open during transfers.
        </div>
      </div>
    </div>
  );
}
