import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Device, HostInfo, ActiveTransfer, TransferStatus, DeviceOS, DeviceType, IncomingTransferRequest } from '../types';
import { api } from '../api/client';
import { wsClient, useWebSocket } from '../api/websocket';
import { supabaseService, SupabaseSharedFile } from '../services/supabaseService';
import { webrtcService } from '../services/webrtcService';

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

  // Bluetooth style pairing
  isNameConfirmed: boolean;
  confirmDeviceName: (name: string) => void;
  openNameSetup: () => void;
  pairedDevice: Device | null;
  pairingWithDevice: Device | null;
  pairingStatus: 'idle' | 'requesting' | 'connected';
  incomingConnectRequest: Device | null;
  connectToDevice: (targetDev: Device) => Promise<void>;
  respondToConnectRequest: (accept: boolean) => Promise<void>;
  disconnectDevice: () => Promise<void>;

  // File Transfer Approval Handshake
  incomingTransferRequest: IncomingTransferRequest | null;
  respondToTransferRequest: (approved: boolean) => Promise<void>;

  // Actions
  createRoom: (name: string) => Promise<string>;
  joinRoomWithPin: (pin: string, name: string) => Promise<{ success: boolean; error?: string; waitingApproval?: boolean }>;
  startPairing: (name: string) => Promise<void>;
  submitPin: (pin: string) => Promise<{ success: boolean; error?: string; waitingApproval?: boolean }>;
  pollPairStatus: () => Promise<boolean>;
  approveDeviceRequest: (deviceId: string, approve: boolean) => Promise<void>;
  sendFiles: (receiverId: string, files: File[]) => Promise<void>;
  sendText: (text: string, receiverId?: string) => Promise<void>;
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

function getDefaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) {
    const match = ua.match(/;\s*([^;)]+)\s+Build/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    return 'Android Phone';
  }
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Macintosh/i.test(ua)) return 'MacBook';
  if (/Linux/i.test(ua)) return 'Linux Device';
  return 'My Device';
}

function getClientType(): DeviceType {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return 'mobile';
  if (/Tablet|iPad/i.test(ua)) return 'tablet';
  return 'desktop';
}

function getClientOS(): DeviceOS {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Linux/i.test(ua)) return 'linux';
  return 'unknown';
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

  // Bluetooth style pairing state: ask for name every fresh session/tab
  const [isNameConfirmed, setIsNameConfirmed] = useState<boolean>(
    () => sessionStorage.getItem('sharex_name_confirmed') === 'true'
  );
  const [pairedDevice, setPairedDevice] = useState<Device | null>(null);
  const [pairingWithDevice, setPairingWithDevice] = useState<Device | null>(null);
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'requesting' | 'connected'>('idle');
  const [incomingConnectRequest, setIncomingConnectRequest] = useState<Device | null>(null);
  const [incomingTransferRequest, setIncomingTransferRequest] = useState<IncomingTransferRequest | null>(null);

  const pendingApprovalResolvers = useRef<Map<string, (approved: boolean) => void>>(new Map());
  const deviceNameRef = useRef<string>(localStorage.getItem('sharex_device_name') || '');
  const myDevRef = useRef<Device | null>(null);
  const pairPollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep myDevRef updated
  useEffect(() => {
    myDevRef.current = myDevice;
  }, [myDevice]);

  // Auto-claim host session on localhost OR auto-join Wi-Fi network lobby on cloud/Vercel
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
      }).catch(() => { });
    } else {
      // Automatic network initialization for Cloud/Vercel: Discover all online devices on same Wi-Fi
      const savedName = localStorage.getItem('sharex_device_name') || getDefaultDeviceName();
      const savedId = localStorage.getItem('sharex_device_id') || `dev-${Math.random().toString(36).substring(2, 8)}`;
      const token = localStorage.getItem('sharex_token') || `supabase-${savedId}`;

      localStorage.setItem('sharex_device_id', savedId);
      localStorage.setItem('sharex_device_name', savedName);
      localStorage.setItem('sharex_token', token);

      const currentDev: Device = {
        id: savedId,
        name: savedName,
        type: getClientType(),
        os: getClientOS(),
        pairedAt: Date.now(),
        lastSeen: Date.now(),
        approved: true,
      };

      setMyDevice(currentDev);
      setDeviceId(savedId);
      setSessionToken(token);
      setIsConnected(true);

      webrtcService.init(currentDev, {
        onTransferProgress: (p: any) => {
          setActiveTransfers((prev) =>
            prev.map((t) =>
              t.transferId === p.transferId
                ? { ...t, progress: Math.min(100, Math.round((p.bytesTransferred / p.totalBytes) * 100)), speed: p.speed }
                : t
            )
          );
        },
        onFileReceived: (f: any) => {
          const incoming: ActiveTransfer = {
            id: `p2p-${Date.now()}`,
            transferId: `p2p-${Date.now()}`,
            files: [],
            fileInfos: [{ name: f.name, size: f.size, mimeType: 'application/octet-stream' }],
            receiverId: savedId,
            status: 'completed',
            progress: 100,
            speed: 0,
            eta: 0,
            direction: 'receive',
            senderName: f.senderName,
            downloadUrls: [f.url],
          };
          setActiveTransfers((prev) => [incoming, ...prev]);
          try {
            const a = document.createElement('a');
            a.href = f.url;
            a.download = f.name;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              try { document.body.removeChild(a); } catch { }
            }, 1000);
          } catch { }
        },
        onTextReceived: (text: string, sender: string) => {
          const incoming: ActiveTransfer = {
            id: `text-${Date.now()}`,
            transferId: `text-${Date.now()}`,
            files: [],
            fileInfos: [],
            receiverId: savedId,
            status: 'completed',
            progress: 100,
            speed: 0,
            eta: 0,
            direction: 'receive',
            senderName: sender,
            transferType: 'text',
            textContent: text,
          };
          setActiveTransfers((prev) => [incoming, ...prev]);
        },
      });

      supabaseService.getNetworkId().then((netId) => {
        supabaseService.joinNetworkLobby(netId, currentDev, {
          onDevicesChange: (onlineList) => {
            const others = onlineList.filter((d) => d.id !== savedId);
            setDevices(others);
          },
          onConnectRequest: (fromDev: Device) => {
            console.log('Incoming connection request from:', fromDev);
            setIncomingConnectRequest(fromDev);
          },
          onConnectResponse: (fromDev: Device, accepted: boolean) => {
            console.log('Connection response from:', fromDev, 'accepted:', accepted);
            if (accepted) {
              setPairedDevice(fromDev);
              setPairingStatus('connected');
              setPairingWithDevice(null);
            } else {
              setPairingStatus('idle');
              setPairingWithDevice(null);
            }
          },
          onDisconnect: () => {
            setPairedDevice(null);
            setPairingStatus('idle');
          },
          onTransferRequest: (reqData: any) => {
            console.log('Incoming transfer request from peer:', reqData);
            setIncomingTransferRequest(reqData);
          },
          onTransferApproval: (apprData: any) => {
            console.log('Transfer approval response from peer:', apprData);
            const resolver = pendingApprovalResolvers.current.get(apprData.transferId);
            if (resolver) {
              resolver(apprData.approved);
              pendingApprovalResolvers.current.delete(apprData.transferId);
            }
          },
          onWebRTCSignal: (sigData: any) => {
            webrtcService.handleSignalingMessage(sigData);
          },
          onFileReceived: (sharedFile: SupabaseSharedFile) => {
            console.log('Successfully received shared file:', sharedFile);
            try {
              const a = document.createElement('a');
              a.href = sharedFile.url;
              a.download = sharedFile.name;
              a.target = '_blank';
              document.body.appendChild(a);
              a.click();
              setTimeout(() => {
                try { document.body.removeChild(a); } catch { }
              }, 1000);
            } catch (err) {
              console.warn('Auto download error:', err);
            }

            const incoming: ActiveTransfer = {
              id: `supabase-${sharedFile.id}`,
              transferId: sharedFile.id,
              files: [],
              fileInfos: [{
                name: sharedFile.name,
                size: sharedFile.size,
                mimeType: sharedFile.type,
              }],
              receiverId: savedId,
              status: 'completed',
              progress: 100,
              speed: 0,
              eta: 0,
              downloadUrls: [sharedFile.url],
              direction: 'receive',
              senderName: sharedFile.senderName,
            };
            setActiveTransfers((prev) => [incoming, ...prev]);
            setTransferHistory((prev) => [{
              id: sharedFile.id,
              files: [{ name: sharedFile.name, size: sharedFile.size }],
              status: 'completed',
              createdAt: Date.now(),
            }, ...prev]);
          },
        });
      });
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
        }).catch(() => { });
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

  const createRoom = useCallback(async (name: string): Promise<string> => {
    const pin = supabaseService.generatePin();
    setHostPin(pin);
    setIsHost(true);
    localStorage.setItem('sharex_host_pin', pin);
    localStorage.setItem('sharex_is_host', 'true');

    const hostDev: Device = {
      id: `host-${pin}`,
      name: name || 'Host PC',
      type: 'desktop',
      os: getClientOS(),
      pairedAt: Date.now(),
      lastSeen: Date.now(),
      approved: true,
    };
    setMyDevice(hostDev);
    setDeviceId(hostDev.id);
    const token = `supabase-${pin}`;
    setSessionToken(token);
    localStorage.setItem('sharex_token', token);

    supabaseService.createHostRoom(pin, hostDev, {
      onPairRequest: (req) => {
        const clientDev: Device = {
          id: req.deviceId,
          name: req.name,
          type: (req.type as any) || 'mobile',
          os: (req.os as any) || 'unknown',
          pairedAt: Date.now(),
          lastSeen: Date.now(),
          approved: false,
        };
        setPendingDevices((prev) => {
          if (prev.some((d) => d.id === clientDev.id)) return prev;
          return [...prev, clientDev];
        });
      },
      onFileReceived: (sharedFile: SupabaseSharedFile) => {
        const incoming: ActiveTransfer = {
          id: `supabase-${sharedFile.id}`,
          transferId: sharedFile.id,
          files: [],
          fileInfos: [{
            name: sharedFile.name,
            size: sharedFile.size,
            mimeType: sharedFile.type,
          }],
          receiverId: hostDev.id,
          status: 'completed',
          progress: 100,
          speed: 0,
          eta: 0,
          downloadUrls: [sharedFile.url],
          direction: 'receive',
          senderName: sharedFile.senderName,
        };
        setActiveTransfers((prev) => [incoming, ...prev]);
        setTransferHistory((prev) => [{
          id: sharedFile.id,
          files: [{ name: sharedFile.name, size: sharedFile.size }],
          status: 'completed',
          createdAt: Date.now(),
        }, ...prev]);
      },
    });

    setIsConnected(true);
    setIsPairingMode(false);
    return pin;
  }, []);

  const joinRoomWithPin = useCallback(async (pin: string, name: string) => {
    const clientDev: Device = {
      id: `client-${Math.random().toString(36).substring(2, 8)}`,
      name: name || 'My Device',
      type: 'mobile',
      os: getClientOS(),
      pairedAt: Date.now(),
      lastSeen: Date.now(),
      approved: false,
    };
    setMyDevice(clientDev);
    setDeviceId(clientDev.id);
    setPairDeviceId(clientDev.id);
    setPairingStep('waiting');

    supabaseService.joinRoomWithPin(pin, clientDev, {
      onApproved: (hostInfo) => {
        const hostDev: Device = {
          id: `host-${pin}`,
          name: hostInfo.name || 'Host',
          type: 'desktop',
          os: 'unknown',
          pairedAt: Date.now(),
          lastSeen: Date.now(),
          approved: true,
        };
        setDevices([hostDev]);
        const token = `supabase-${pin}`;
        completeAuth(clientDev.id, token, clientDev);
      },
      onRejected: () => {
        setPairingStep('init');
        setIsConnected(false);
      },
      onFileReceived: (sharedFile: SupabaseSharedFile) => {
        const incoming: ActiveTransfer = {
          id: `supabase-${sharedFile.id}`,
          transferId: sharedFile.id,
          files: [],
          fileInfos: [{
            name: sharedFile.name,
            size: sharedFile.size,
            mimeType: sharedFile.type,
          }],
          receiverId: clientDev.id,
          status: 'completed',
          progress: 100,
          speed: 0,
          eta: 0,
          downloadUrls: [sharedFile.url],
          direction: 'receive',
          senderName: sharedFile.senderName,
        };
        setActiveTransfers((prev) => [incoming, ...prev]);
        setTransferHistory((prev) => [{
          id: sharedFile.id,
          files: [{ name: sharedFile.name, size: sharedFile.size }],
          status: 'completed',
          createdAt: Date.now(),
        }, ...prev]);
      },
    });

    return { success: true, waitingApproval: true };
  }, []);

  const startPairing = useCallback(async (name: string) => {
    deviceNameRef.current = name;
    localStorage.setItem('sharex_device_name', name);
    setIsPairingMode(true);
    setPairingStep('pin');

    try {
      const res = await api.initPair(name);
      if (res.success && res.data) {
        const { deviceId: did } = res.data;
        setPairDeviceId(did);
        localStorage.setItem('sharex_device_id', did);
      }
    } catch {
      // Local server not running, Supabase PIN pairing will be used
    }
  }, []);

  const submitPin = useCallback(async (pin: string) => {
    const name = deviceNameRef.current || localStorage.getItem('sharex_device_name') || 'My Device';

    // First attempt Supabase room pairing
    try {
      const supaRes = await joinRoomWithPin(pin, name);
      if (supaRes.success) return supaRes;
    } catch { }

    // Fallback to local API verifyPin if available
    if (pairDeviceId) {
      try {
        const res = await api.verifyPin(pairDeviceId, pin);
        if (res.success) {
          if (res.data?.sessionToken) {
            completeAuth(pairDeviceId, res.data.sessionToken, res.data.device);
            return { success: true };
          }
          if (res.data?.waitingApproval) {
            setPairingStep('waiting');
            startPairPolling(pairDeviceId);
            return { success: true, waitingApproval: true };
          }
        }
      } catch { }
    }

    return { success: false, error: 'Could not connect. Please check PIN.' };
  }, [pairDeviceId, joinRoomWithPin]);

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
    // Check if Supabase session is active
    if (sessionToken && sessionToken.startsWith('supabase-')) {
      const fileInfos = files.map((f) => ({
        name: f.name,
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
      }));
      const totalSize = files.reduce((s, f) => s + f.size, 0);
      const sender = myDevice || ({ id: deviceId || 'sender', name: 'Device', type: 'mobile', os: 'unknown', approved: true, pairedAt: 0, lastSeen: 0 } as Device);
      const transferId = `trans-${Date.now()}`;

      if (!receiverId || receiverId === 'all') {
        throw new Error('Please select an online device to send files to');
      }

      // 1. Mandatory Transfer Permission Handshake (Bluetooth / ShareMe style)
      const localTransfer: ActiveTransfer = {
        id: `send-${transferId}`,
        transferId,
        files,
        fileInfos,
        receiverId,
        status: 'waiting_approval',
        progress: 0,
        speed: 0,
        eta: 0,
        direction: 'send',
        transferType: 'file',
      };
      setActiveTransfers((prev) => [localTransfer, ...prev]);

      await supabaseService.requestTransfer(sender, receiverId, {
        transferId,
        files: fileInfos,
        totalSize,
        transferType: 'file',
      });

      // Wait up to 45 seconds for receiver to approve or decline
      const approved = await new Promise<boolean>((resolve) => {
        pendingApprovalResolvers.current.set(transferId, resolve);
        setTimeout(() => {
          if (pendingApprovalResolvers.current.has(transferId)) {
            pendingApprovalResolvers.current.delete(transferId);
            resolve(false);
          }
        }, 45000);
      });

      if (!approved) {
        setActiveTransfers((prev) =>
          prev.map((t) => t.transferId === transferId ? { ...t, status: 'failed', error: 'Transfer declined by receiver' } : t)
        );
        throw new Error('Transfer was declined by receiver');
      }

      // Receiver approved! Update status to uploading
      setActiveTransfers((prev) =>
        prev.map((t) => t.transferId === transferId ? { ...t, status: 'uploading' } : t)
      );

      // 2. Transfer files (Direct P2P or Cloud Fallback)
      for (const file of files) {
        let p2pSuccess = false;
        if (receiverId !== 'all') {
          p2pSuccess = await webrtcService.sendFileP2P(file, receiverId, (prog, speed) => {
            setActiveTransfers((prev) =>
              prev.map((t) => t.transferId === transferId ? { ...t, progress: prog, speed } : t)
            );
          });
        }

        if (p2pSuccess) {
          setActiveTransfers((prev) =>
            prev.map((t) => t.transferId === transferId ? { ...t, status: 'completed', progress: 100 } : t)
          );
          setTransferHistory((prev) => [{
            id: transferId,
            files: [{ name: file.name, size: file.size }],
            status: 'completed',
            createdAt: Date.now(),
          }, ...prev]);
          continue;
        }

        // Fallback to Supabase cloud storage
        const res = await supabaseService.shareFile(file, sender, receiverId);
        if (res.success && res.fileInfo) {
          setActiveTransfers((prev) =>
            prev.map((t) => t.transferId === transferId ? { ...t, status: 'completed', progress: 100, downloadUrls: [res.fileInfo!.url] } : t)
          );
          setTransferHistory((prev) => [{
            id: transferId,
            files: [{ name: file.name, size: file.size }],
            status: 'completed',
            createdAt: Date.now(),
          }, ...prev]);
        } else {
          setActiveTransfers((prev) =>
            prev.map((t) => t.transferId === transferId ? { ...t, status: 'failed', error: res.error || 'Upload failed' } : t)
          );
        }
      }
      return;
    }

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

    if (receiverId === 'host') {
      await uploadAllFiles(transferId, files, fileInfos);
    } else {
      waitForApprovalAndUpload(transferId, files, fileInfos);
    }
  }, [sessionToken, myDevice]);

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
    const t = activeTransfers.find((at) => at.transferId === transferId || at.id === transferId);
    const directUrl = t?.downloadUrls?.[fileIndex] || t?.downloadUrls?.[0];
    const url = directUrl || api.downloadUrl(transferId, fileIndex);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [activeTransfers]);

  const renameDevice = useCallback(async (id: string, name: string) => {
    if (myDevice && id === myDevice.id) {
      const updated = { ...myDevice, name };
      setMyDevice(updated);
      localStorage.setItem('sharex_device_name', name);
      supabaseService.updatePresence(updated);
    }
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
    try {
      await api.renameDevice(id, name);
    } catch { }
  }, [myDevice]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
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

  const refreshDevices = useCallback(async () => {
    try {
      const res = await api.getDevices();
      if (res.success && res.data?.devices) {
        setDevices(res.data.devices);
      }
    } catch { }
  }, []);

  const approveDeviceRequest = useCallback(async (devId: string, approve: boolean) => {
    if (sessionToken && sessionToken.startsWith('supabase-')) {
      supabaseService.approveDevice(approve, myDevice?.name || 'Host');
      if (approve) {
        const approvedDev = pendingDevices.find((d) => d.id === devId);
        if (approvedDev) {
          setDevices((prev) => [...prev, { ...approvedDev, approved: true }]);
        }
      }
      setPendingDevices((prev) => prev.filter((d) => d.id !== devId));
      return;
    }

    const res = await api.approveDevice(devId, approve, sessionToken || '');
    if (res.success) {
      setPendingDevices((prev) => prev.filter((d) => d.id !== devId));
      refreshDevices();
    }
  }, [sessionToken, refreshDevices, pendingDevices, myDevice]);

  const openNameSetup = useCallback(() => {
    setIsNameConfirmed(false);
  }, []);

  const confirmDeviceName = useCallback((name: string) => {
    const trimmed = name.trim() || getDefaultDeviceName();
    localStorage.setItem('sharex_device_name', trimmed);
    sessionStorage.setItem('sharex_name_confirmed', 'true');
    setIsNameConfirmed(true);
    const current = myDevRef.current;
    if (current) {
      const updated = { ...current, name: trimmed };
      setMyDevice(updated);
      supabaseService.updatePresence(updated);
    }
  }, []);

  const connectToDevice = useCallback(async (targetDev: Device) => {
    if (!myDevice) return;
    setPairingWithDevice(targetDev);
    setPairingStatus('requesting');
    await supabaseService.sendConnectRequest(myDevice, targetDev.id);
  }, [myDevice]);

  const respondToConnectRequest = useCallback(async (accept: boolean) => {
    const current = myDevRef.current;
    if (!current || !incomingConnectRequest) return;
    await supabaseService.respondConnectRequest(current, incomingConnectRequest.id, accept);
    if (accept) {
      setPairedDevice(incomingConnectRequest);
      setPairingStatus('connected');
    }
    setIncomingConnectRequest(null);
  }, [incomingConnectRequest]);

  const disconnectDevice = useCallback(async () => {
    if (!myDevice || !pairedDevice) return;
    await supabaseService.sendDisconnect(myDevice.id, pairedDevice.id);
    setPairedDevice(null);
    setPairingStatus('idle');
  }, [myDevice, pairedDevice]);

  const respondToTransferRequest = useCallback(async (approved: boolean) => {
    const current = myDevRef.current;
    if (!current || !incomingTransferRequest) return;

    await supabaseService.respondTransfer(
      current.id,
      incomingTransferRequest.fromDevice.id,
      incomingTransferRequest.transferId,
      approved
    );

    if (approved) {
      const isText = incomingTransferRequest.transferType === 'text';
      const incoming: ActiveTransfer = {
        id: `inc-${incomingTransferRequest.transferId}`,
        transferId: incomingTransferRequest.transferId,
        files: [],
        fileInfos: incomingTransferRequest.files,
        receiverId: current.id,
        status: isText ? 'completed' : 'approved',
        progress: isText ? 100 : 0,
        speed: 0,
        eta: 0,
        direction: 'receive',
        senderName: incomingTransferRequest.fromDevice.name,
        transferType: incomingTransferRequest.transferType,
        textContent: incomingTransferRequest.textContent,
      };
      setActiveTransfers((prev) => [incoming, ...prev]);
    }

    setIncomingTransferRequest(null);
  }, [incomingTransferRequest]);

  const sendText = useCallback(async (text: string, receiverId?: string) => {
    const current = myDevRef.current;
    if (!current || !text.trim()) return;

    if (!receiverId || receiverId === 'all') {
      throw new Error('Please select an online device to send message to');
    }

    const transferId = `text-${Date.now()}`;

    // 1. Add local transfer in waiting_approval state
    const localTransfer: ActiveTransfer = {
      id: `send-${transferId}`,
      transferId,
      files: [],
      fileInfos: [],
      receiverId,
      status: 'waiting_approval',
      progress: 0,
      speed: 0,
      eta: 0,
      direction: 'send',
      transferType: 'text',
      textContent: text.trim(),
    };
    setActiveTransfers((prev) => [localTransfer, ...prev]);

    // 2. Send transfer permission request to receiver
    await supabaseService.requestTransfer(current, receiverId, {
      transferId,
      files: [],
      totalSize: text.length,
      transferType: 'text',
      textContent: text.trim(),
    });

    // 3. Wait up to 45 seconds for receiver to approve or decline
    const approved = await new Promise<boolean>((resolve) => {
      pendingApprovalResolvers.current.set(transferId, resolve);
      setTimeout(() => {
        if (pendingApprovalResolvers.current.has(transferId)) {
          pendingApprovalResolvers.current.delete(transferId);
          resolve(false);
        }
      }, 45000);
    });

    if (!approved) {
      setActiveTransfers((prev) =>
        prev.map((t) => t.transferId === transferId ? { ...t, status: 'failed', error: 'Message declined by receiver' } : t)
      );
      throw new Error('Message was declined by receiver');
    }

    // Receiver approved! Update status to completed
    setActiveTransfers((prev) =>
      prev.map((t) => t.transferId === transferId ? { ...t, status: 'completed', progress: 100 } : t)
    );
  }, []);

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
    isNameConfirmed,
    confirmDeviceName,
    openNameSetup,
    pairedDevice,
    pairingWithDevice,
    pairingStatus,
    incomingConnectRequest,
    connectToDevice,
    respondToConnectRequest,
    disconnectDevice,
    incomingTransferRequest,
    respondToTransferRequest,
    createRoom,
    joinRoomWithPin,
    startPairing,
    submitPin,
    pollPairStatus,
    approveDeviceRequest,
    sendFiles,
    sendText,
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
