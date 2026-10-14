import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Device, HostInfo, ActiveTransfer, TransferStatus } from '../types';
import { api } from '../api/client';
import { wsClient, useWebSocket } from '../api/websocket';

interface AppState {
  // Auth state
  isConnected: boolean;
  deviceId: string | null;
  sessionToken: string | null;
  myDevice: Device | null;
  isPairingMode: boolean;
  pairingStep: 'init' | 'pin' | 'waiting' | 'done';
  pairDeviceId: string | null;
  isHost: boolean;
  hostPin: string;

  // Host info
  hostInfo: HostInfo | null;
  qrCode: string | null;
  qrUrl: string | null;

  // Devices
  devices: Device[];
  pendingDevices: Device[];

  // Transfers
  activeTransfers: ActiveTransfer[];
  transferHistory: any[];

  // Theme
  theme: 'dark' | 'light';

  // Actions
  startPairing: (name: string) => Promise<void>;
  submitPin: (pin: string) => Promise<{ success: boolean; error?: string; waitingApproval?: boolean }>;
  pollPairStatus: () => Promise<boolean>;
  approveDeviceRequest: (deviceId: string, approve: boolean) => Promise<void>;
  sendFiles: (receiverId: string, files: File[]) => Promise<void>;
  cancelTransfer: (id: string) => Promise<void>;
  retryTransfer: (id: string) => void;
  downloadFile: (transferId: string, fileIndex: number, filename: string) => void;
  renameDevice: (id: string, name: string) => Promise<void>;
  toggleTheme: () => void;
  setDeviceName: (name: string) => void;
  clearHistory: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  approveIncomingTransfer: (transferId: string, approve: boolean) => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}

function getStoredTheme(): 'dark' | 'light' {
  return (localStorage.getItem('sharex_theme') as any) || 'dark';
}

function computeChecksum(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target!.result as ArrayBuffer;
        const hash = await crypto.subtle.digest('SHA-256', buffer);
        const hex = Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        resolve(hex);
      } catch {
        resolve(''); // checksum optional
      }
    };
    reader.onerror = () => resolve('');
    reader.readAsArrayBuffer(file);
  });
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(() => localStorage.getItem('sharex_device_id'));
  const [sessionToken, setSessionToken] = useState<string | null>(() => localStorage.getItem('sharex_token'));
  const [myDevice, setMyDevice] = useState<Device | null>(null);
  const [isPairingMode, setIsPairingMode] = useState(false);
  const [pairingStep, setPairingStep] = useState<'init' | 'pin' | 'waiting' | 'done'>('init');
  const [pairDeviceId, setPairDeviceId] = useState<string | null>(null);

  const [isHost, setIsHost] = useState<boolean>(() => localStorage.getItem('sharex_is_host') === 'true');
  const [hostPin, setHostPin] = useState<string>('');

  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const [devices, setDevices] = useState<Device[]>([]);
  const [pendingDevices, setPendingDevices] = useState<Device[]>([]);
  const [activeTransfers, setActiveTransfers] = useState<ActiveTransfer[]>([]);
  const [transferHistory, setTransferHistory] = useState<any[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>(getStoredTheme);

  const deviceNameRef = useRef<string>(localStorage.getItem('sharex_device_name') || '');
  const pairPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-claim host session on localhost
  useEffect(() => {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (isLocalhost) {
      api.claimHostSession().then((res) => {
        if (res.success && res.data) {
          setIsHost(true);
          setHostPin(res.data.pin);
          localStorage.setItem('sharex_is_host', 'true');
          setSessionToken(res.data.sessionToken);
          setDeviceId(res.data.deviceId);
          setMyDevice(res.data.device);
          localStorage.setItem('sharex_token', res.data.sessionToken);
          localStorage.setItem('sharex_device_id', res.data.deviceId);
          localStorage.setItem('sharex_device_name', res.data.device?.name || 'Host PC');
          setIsConnected(true);
        }
      }).catch(() => {});
    }
  }, []);

  // Poll pending devices for host approval
  useEffect(() => {
    if (isHost && sessionToken) {
      const fetchPending = () => {
        api.getPendingDevices(sessionToken).then((r) => {
          if (r.success && r.data?.pending) {
            setPendingDevices(r.data.pending);
          }
        }).catch(() => {});
      };
      fetchPending();
      const interval = setInterval(fetchPending, 2500);
      return () => clearInterval(interval);
    }
  }, [isHost, sessionToken]);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sharex_theme', theme);
  }, [theme]);

  // Fetch host info and QR code on mount
  useEffect(() => {
    api.getHostInfo().then((r) => {
      if (r.success) setHostInfo(r.data);
    });
    api.getQRCode().then((r) => {
      if (r.success && r.data) {
        setQrCode(r.data.qrcode);
        setQrUrl(r.data.url);
      }
    });
  }, []);

  // Connect WebSocket when we have a token
  useEffect(() => {
    if (!sessionToken) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsBase = `${proto}//${window.location.host}`;
    wsClient.connect(wsBase, sessionToken);
    setIsConnected(true);

    return () => {
      wsClient.disconnect();
      setIsConnected(false);
    };
  }, [sessionToken]);

  // Refresh device list when connected
  useEffect(() => {
    if (sessionToken) {
      refreshDevices();
      api.getHistory().then((r) => {
        if (r.success) setTransferHistory(r.data?.history || []);
      });
    }
  }, [sessionToken]);

  // WS: device joined
  useWebSocket('device_joined', (msg) => {
    const { device, devices: allDevices, pending } = msg.payload as any;
    if (allDevices) {
      setDevices(allDevices.filter((d: Device) => d.approved));
    } else if (device && !pending) {
      setDevices((prev) => {
        const idx = prev.findIndex((d) => d.id === device.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = device;
          return next;
        }
        return [...prev, device];
      });
    } else if (device && pending) {
      setPendingDevices((prev) => {
        const idx = prev.findIndex((d) => d.id === device.id);
        if (idx >= 0) return prev;
        return [...prev, device];
      });
    }
  });

  // WS: device left
  useWebSocket('device_left', (msg) => {
    const { deviceId: leftId } = msg.payload as any;
    setDevices((prev) => prev.filter((d) => d.id !== leftId));
  });

  // WS: device updated
  useWebSocket('device_updated', (msg) => {
    const { device } = msg.payload as any;
    setDevices((prev) =>
      prev.map((d) => (d.id === device.id ? { ...d, ...device } : d))
    );
    if (myDevice?.id === device.id) {
      setMyDevice((prev) => prev ? { ...prev, ...device } : prev);
    }
  });

  // WS: transfer progress
  useWebSocket('transfer_progress', (msg) => {
    const p = msg.payload as any;
    setActiveTransfers((prev) =>
      prev.map((t) => {
        if (t.transferId !== p.transferId) return t;
        const progress = t.fileInfos.reduce((acc, fi) => acc + fi.size, 0) > 0
          ? Math.round((p.bytesTransferred / t.fileInfos.reduce((acc, fi) => acc + fi.size, 0)) * 100)
          : 0;
        return { ...t, progress: Math.min(progress, 99), speed: p.speed, eta: p.eta, status: 'uploading' };
      })
    );
  });

  // WS: transfer complete
  useWebSocket('transfer_complete', (msg) => {
    const { transferId, downloadUrls } = msg.payload as any;
    setActiveTransfers((prev) =>
      prev.map((t) =>
        t.transferId === transferId
          ? { ...t, status: 'completed', progress: 100, downloadUrls }
          : t
      )
    );
    api.getHistory().then((r) => {
      if (r.success) setTransferHistory(r.data?.history || []);
    });
  });

  // WS: transfer failed
  useWebSocket('transfer_failed', (msg) => {
    const { transferId, error } = msg.payload as any;
    setActiveTransfers((prev) =>
      prev.map((t) =>
        t.transferId === transferId ? { ...t, status: 'failed', error } : t
      )
    );
  });

  // WS: transfer cancelled
  useWebSocket('transfer_cancelled', (msg) => {
    const { transferId } = msg.payload as any;
    setActiveTransfers((prev) =>
      prev.map((t) =>
        t.transferId === transferId ? { ...t, status: 'cancelled' } : t
      )
    );
  });

  // WS: relay ready (receiver gets files from another device)
  useWebSocket('relay_ready', (msg) => {
    const { transferId, files, senderName, downloadUrls } = msg.payload as any;
    const incoming: ActiveTransfer = {
      id: `recv-${transferId}`,
      transferId,
      files: [],
      fileInfos: files,
      receiverId: myDevice?.id || '',
      status: 'waiting_approval',
      progress: 0,
      speed: 0,
      eta: 0,
      direction: 'receive',
      senderName,
      downloadUrls,
    };
    setActiveTransfers((prev) => [...prev, incoming]);
  });

  // WS: transfer request (for device-to-device)
  useWebSocket('transfer_request', (msg) => {
    const { transfer, senderName } = msg.payload as any;
    const incoming: ActiveTransfer = {
      id: `req-${transfer.id}`,
      transferId: transfer.id,
      files: [],
      fileInfos: transfer.files,
      receiverId: myDevice?.id || '',
      status: 'waiting_approval',
      progress: 0,
      speed: 0,
      eta: 0,
      direction: 'receive',
      senderName,
    };
    setActiveTransfers((prev) => [...prev, incoming]);
  });

  // WS: transfer approved (sender waits for this to start uploading)
  useWebSocket('transfer_approved', (msg) => {
    const { transferId } = msg.payload as any;
    // Find in active transfers and mark approved — upload will be triggered elsewhere
    setActiveTransfers((prev) =>
      prev.map((t) => t.transferId === transferId ? { ...t, status: 'approved' } : t)
    );
  });

  const startPairing = useCallback(async (name: string) => {
    deviceNameRef.current = name;
    localStorage.setItem('sharex_device_name', name);
    setIsPairingMode(true);
    setPairingStep('init');

    const res = await api.initPair(name);
    if (!res.success || !res.data) throw new Error(res.error || 'Pairing init failed');

    const { deviceId: did, sessionToken: token, requiresPin } = res.data;
    setPairDeviceId(did);
    localStorage.setItem('sharex_device_id', did);

    if (!requiresPin) {
      // Auto-pass PIN step
      const pinRes = await api.verifyPin(did, '000000');
      if (pinRes.success && pinRes.data?.sessionToken) {
        completeAuth(did, pinRes.data.sessionToken, pinRes.data.device);
      }
    } else {
      setPairingStep('pin');
    }
  }, []);

  const submitPin = useCallback(async (pin: string) => {
    if (!pairDeviceId) return { success: false, error: 'No device ID' };
    const res = await api.verifyPin(pairDeviceId, pin);
    if (!res.success) return { success: false, error: res.error };

    if (res.data?.sessionToken) {
      completeAuth(pairDeviceId, res.data.sessionToken, res.data.device);
      return { success: true };
    }

    if (res.data?.waitingApproval) {
      setPairingStep('waiting');
      startPairPolling(pairDeviceId);
      return { success: true, waitingApproval: true };
    }

    return { success: false, error: 'Unexpected response' };
  }, [pairDeviceId]);

  function startPairPolling(did: string) {
    if (pairPollTimer.current) clearInterval(pairPollTimer.current);
    pairPollTimer.current = setInterval(async () => {
      const r = await api.checkPairStatus(did);
      if (r.success && r.data?.approved && r.data?.sessionToken) {
        clearInterval(pairPollTimer.current!);
        completeAuth(did, r.data.sessionToken, r.data.device);
      }
    }, 2000);
  }

  const pollPairStatus = useCallback(async (): Promise<boolean> => {
    if (!pairDeviceId) return false;
    const r = await api.checkPairStatus(pairDeviceId);
    if (r.success && r.data?.approved && r.data?.sessionToken) {
      completeAuth(pairDeviceId, r.data.sessionToken, r.data.device);
      return true;
    }
    return false;
  }, [pairDeviceId]);

  function completeAuth(did: string, token: string, device?: Device) {
    setDeviceId(did);
    setSessionToken(token);
    setMyDevice(device || null);
    localStorage.setItem('sharex_token', token);
    localStorage.setItem('sharex_device_id', did);
    setPairingStep('done');
    setIsPairingMode(false);
    setIsConnected(true);
    if (pairPollTimer.current) clearInterval(pairPollTimer.current);
  }

  const sendFiles = useCallback(async (receiverId: string, files: File[]) => {
    const fileInfos = files.map((f) => ({
      name: f.name,
      size: f.size,
      mimeType: f.type || 'application/octet-stream',
    }));

    const initRes = await api.initiateTransfer(receiverId, fileInfos);
    if (!initRes.success || !initRes.data?.transferId) {
      throw new Error(initRes.error || 'Failed to initiate transfer');
    }

    const { transferId } = initRes.data;

    const localTransfer: ActiveTransfer = {
      id: `send-${transferId}`,
      transferId,
      files,
      fileInfos,
      receiverId,
      status: receiverId === 'host' ? 'approved' : 'waiting_approval',
      progress: 0,
      speed: 0,
      eta: 0,
      direction: 'send',
    };

    setActiveTransfers((prev) => [...prev, localTransfer]);

    // For host transfers, upload immediately
    // For device-to-device, wait for transfer_approved WS event
    if (receiverId === 'host') {
      await uploadAllFiles(transferId, files, fileInfos);
    } else {
      // Wait for approval via WebSocket
      waitForApprovalAndUpload(transferId, files, fileInfos);
    }
  }, []);

  async function uploadAllFiles(transferId: string, files: File[], fileInfos: any[]) {
    const totalSize = fileInfos.reduce((s, f) => s + f.size, 0);
    let totalUploaded = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const checksum = file.size < 100 * 1024 * 1024 ? await computeChecksum(file) : '';

      const result = await api.uploadFile(
        transferId,
        i,
        file,
        checksum,
        (bytes) => {
          totalUploaded = fileInfos.slice(0, i).reduce((s: number, f: any) => s + f.size, 0) + bytes;
          const progress = totalSize > 0 ? Math.round((totalUploaded / totalSize) * 100) : 0;
          setActiveTransfers((prev) =>
            prev.map((t) =>
              t.transferId === transferId ? { ...t, progress: Math.min(progress, 99) } : t
            )
          );
        }
      );

      if (!result.success) {
        setActiveTransfers((prev) =>
          prev.map((t) =>
            t.transferId === transferId
              ? { ...t, status: 'failed', error: result.error || 'Upload failed' }
              : t
          )
        );
        return;
      }
    }
  }

  function waitForApprovalAndUpload(transferId: string, files: File[], fileInfos: any[]) {
    const MAX_WAIT = 120000;
    const start = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - start > MAX_WAIT) {
        clearInterval(interval);
        setActiveTransfers((prev) =>
          prev.map((t) =>
            t.transferId === transferId ? { ...t, status: 'failed', error: 'Approval timeout' } : t
          )
        );
        return;
      }
      const transfer = activeTransfers.find((t) => t.transferId === transferId);
      if (transfer?.status === 'approved') {
        clearInterval(interval);
        uploadAllFiles(transferId, files, fileInfos);
      }
    }, 500);
  }

  const cancelTransfer = useCallback(async (id: string) => {
    const t = activeTransfers.find((at) => at.id === id || at.transferId === id);
    if (!t) return;
    await api.cancelTransfer(t.transferId);
    setActiveTransfers((prev) =>
      prev.map((at) => at.id === id ? { ...at, status: 'cancelled' } : at)
    );
  }, [activeTransfers]);

  const retryTransfer = useCallback((id: string) => {
    const t = activeTransfers.find((at) => at.id === id);
    if (!t || !t.files.length) return;
    setActiveTransfers((prev) => prev.filter((at) => at.id !== id));
    sendFiles(t.receiverId, t.files);
  }, [activeTransfers, sendFiles]);

  const downloadFile = useCallback((transferId: string, fileIndex: number, filename: string) => {
    const url = api.downloadUrl(transferId, fileIndex);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }, []);

  const renameDevice = useCallback(async (id: string, name: string) => {
    await api.renameDevice(id, name);
  }, []);

  const refreshDevices = useCallback(async () => {
    const r = await api.getDevices();
    if (r.success) {
      setDevices(r.data?.devices?.filter((d: Device) => d.approved) || []);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const setDeviceName = useCallback((name: string) => {
    deviceNameRef.current = name;
    localStorage.setItem('sharex_device_name', name);
  }, []);

  const clearHistory = useCallback(async () => {
    await api.clearHistory();
    setTransferHistory([]);
  }, []);

  const approveIncomingTransfer = useCallback(async (transferId: string, approve: boolean) => {
    await api.approveTransfer(transferId, approve);
    if (!approve) {
      setActiveTransfers((prev) => prev.filter((t) => t.transferId !== transferId));
    } else {
      setActiveTransfers((prev) =>
        prev.map((t) => t.transferId === transferId ? { ...t, status: 'approved' } : t)
      );
    }
  }, []);

  const approveDeviceRequest = useCallback(async (devId: string, approve: boolean) => {
    const res = await api.approveDevice(devId, approve, sessionToken || '');
    if (res.success) {
      setPendingDevices((prev) => prev.filter((d) => d.id !== devId));
      refreshDevices();
    }
  }, [sessionToken, refreshDevices]);

  const value: AppState = {
    isConnected,
    deviceId,
    sessionToken,
    myDevice,
    isPairingMode,
    pairingStep,
    pairDeviceId,
    isHost,
    hostPin,
    hostInfo,
    qrCode,
    qrUrl,
    devices,
    pendingDevices,
    activeTransfers,
    transferHistory,
    theme,
    startPairing,
    submitPin,
    pollPairStatus,
    approveDeviceRequest,
    sendFiles,
    cancelTransfer,
    retryTransfer,
    downloadFile,
    renameDevice,
    toggleTheme,
    setDeviceName,
    clearHistory,
    refreshDevices,
    approveIncomingTransfer,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
