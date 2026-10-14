const BASE_URL = import.meta.env.VITE_API_URL || '';

function getToken(): string | null {
  return localStorage.getItem('sharex_token');
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string; code?: string }> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['x-session-token'] = token;
  }

  if (!(options.body instanceof FormData) && !(options.body instanceof ReadableStream) && !(options.body instanceof Uint8Array) && !(options.body instanceof ArrayBuffer)) {
    if (!headers['Content-Type'] && options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const json = await res.json().catch(() => ({ success: false, error: 'Invalid response' }));
  return json;
}

export const api = {
  // Host info & session
  getHostInfo: () => apiFetch<any>('/api/host-info'),
  getQRCode: () => apiFetch<{ qrcode: string; url: string }>('/api/qrcode'),
  claimHostSession: () =>
    apiFetch<{ isHost: boolean; deviceId: string; sessionToken: string; pin: string; device: any }>('/api/host/claim'),

  // Pairing
  initPair: (name: string) =>
    apiFetch<any>('/api/pair/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  verifyPin: (deviceId: string, pin: string) =>
    apiFetch<any>('/api/pair/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, pin }),
    }),
  checkPairStatus: (deviceId: string) =>
    apiFetch<any>(`/api/pair/status/${deviceId}`),
  approveDevice: (deviceId: string, approve: boolean, hostToken: string) =>
    apiFetch<any>('/api/pair/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
      body: JSON.stringify({ deviceId, approve }),
    }),

  // Devices
  getDevices: () => apiFetch<any>('/api/devices'),
  getPendingDevices: (hostToken: string) =>
    apiFetch<any>('/api/devices/pending', {
      headers: { 'x-host-token': hostToken },
    }),
  renameDevice: (id: string, name: string) =>
    apiFetch<any>(`/api/devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  disconnectDevice: (id: string) =>
    apiFetch<any>(`/api/devices/${id}`, { method: 'DELETE' }),

  // Transfers
  initiateTransfer: (receiverId: string, files: Array<{ name: string; size: number; mimeType: string }>) =>
    apiFetch<any>('/api/transfers/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverId, files }),
    }),
  approveTransfer: (transferId: string, approve: boolean) =>
    apiFetch<any>(`/api/transfers/${transferId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approve }),
    }),
  cancelTransfer: (transferId: string) =>
    apiFetch<any>(`/api/transfers/${transferId}`, { method: 'DELETE' }),
  getHistory: () => apiFetch<any>('/api/transfers/history'),
  clearHistory: () => apiFetch<any>('/api/transfers/history', { method: 'DELETE' }),

  // Upload a single file (raw streaming)
  uploadFile: (
    transferId: string,
    fileIndex: number,
    file: File,
    checksum: string,
    onProgress?: (bytes: number) => void
  ): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const token = getToken();
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/api/transfers/${transferId}/upload/${fileIndex}`);
      if (token) xhr.setRequestHeader('x-session-token', token);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('x-checksum', checksum);

      xhr.upload.onprogress = (e) => {
        if (onProgress) onProgress(e.loaded);
      };

      xhr.onload = () => {
        try {
          const resp = JSON.parse(xhr.responseText);
          resolve(resp);
        } catch {
          resolve({ success: xhr.status < 400 });
        }
      };
      xhr.onerror = () => resolve({ success: false, error: 'Network error' });
      xhr.send(file);
    });
  },

  // Build download URL
  downloadUrl: (transferId: string, fileIndex: number): string => {
    const token = getToken();
    return `${BASE_URL}/api/transfers/${transferId}/download/${fileIndex}?token=${token}`;
  },
};

export { getToken };
