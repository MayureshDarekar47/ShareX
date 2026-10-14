import { v4 as uuidv4 } from 'uuid';
import { Device, DeviceType, DeviceOS } from '../types';
import { generateSessionToken } from '../utils/crypto';
import { config } from '../config';

interface PendingDevice {
  device: Device;
  pinAttempts: number;
  createdAt: number;
  approved: boolean | null; // null = waiting
}

class DeviceStore {
  private devices = new Map<string, Device>(); // deviceId -> Device
  private pendingDevices = new Map<string, PendingDevice>(); // deviceId -> PendingDevice
  private sessionTokenIndex = new Map<string, string>(); // token -> deviceId

  constructor() {
    this.initHostDevice();
  }

  private initHostDevice(): void {
    const osPlatform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
    const hostDevice: Device = {
      id: 'host',
      name: `${config.hostName} (Host PC)`,
      type: 'desktop',
      os: osPlatform,
      sessionToken: config.sessionSecret,
      pairedAt: Date.now(),
      lastSeen: Date.now(),
      approved: true,
    };
    this.devices.set('host', hostDevice);
    this.sessionTokenIndex.set(config.sessionSecret, 'host');
  }

  /**
   * Initiate pairing for a new device.
   * Returns the pending device record.
   */
  initiatePairing(userAgent: string, requestedName?: string): Device {
    const id = uuidv4();
    const sessionToken = generateSessionToken();
    const { type, os } = detectDeviceInfo(userAgent);

    const device: Device = {
      id,
      name: requestedName || generateDeviceName(os, type),
      type,
      os,
      sessionToken,
      pairedAt: Date.now(),
      lastSeen: Date.now(),
      approved: false,
    };

    this.pendingDevices.set(id, {
      device,
      pinAttempts: 0,
      createdAt: Date.now(),
      approved: null,
    });

    return device;
  }

  /**
   * Verify the PIN for a pending device.
   */
  verifyPin(deviceId: string, pin: string): { ok: boolean; attemptsLeft: number; error?: string } {
    const pending = this.pendingDevices.get(deviceId);
    if (!pending) {
      return { ok: false, attemptsLeft: 0, error: 'Device not found in pairing queue' };
    }

    const MAX_ATTEMPTS = 5;
    if (pending.pinAttempts >= MAX_ATTEMPTS) {
      return { ok: false, attemptsLeft: 0, error: 'Too many PIN attempts' };
    }

    if (!config.requirePin || pin === config.pin) {
      return { ok: true, attemptsLeft: MAX_ATTEMPTS - pending.pinAttempts };
    }

    pending.pinAttempts++;
    const attemptsLeft = MAX_ATTEMPTS - pending.pinAttempts;
    return { ok: false, attemptsLeft, error: `Incorrect PIN. ${attemptsLeft} attempts remaining.` };
  }

  /**
   * Approve or reject a pending device. Called by the host.
   */
  approveDevice(deviceId: string, approve: boolean): Device | null {
    const pending = this.pendingDevices.get(deviceId);
    if (!pending) return null;

    if (!approve) {
      this.pendingDevices.delete(deviceId);
      return null;
    }

    pending.device.approved = true;
    pending.approved = true;

    this.devices.set(deviceId, pending.device);
    this.sessionTokenIndex.set(pending.device.sessionToken, deviceId);
    this.pendingDevices.delete(deviceId);

    return pending.device;
  }

  /**
   * If approval is not required, auto-approve after PIN verification.
   */
  autoApprove(deviceId: string): Device | null {
    return this.approveDevice(deviceId, true);
  }

  /**
   * Resolve a session token to a device.
   */
  getDeviceByToken(token: string): Device | undefined {
    const deviceId = this.sessionTokenIndex.get(token);
    if (!deviceId) return undefined;
    return this.devices.get(deviceId);
  }

  getDeviceById(id: string): Device | undefined {
    return this.devices.get(id);
  }

  getPendingDevice(id: string): PendingDevice | undefined {
    return this.pendingDevices.get(id);
  }

  getAllDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  getAllPendingDevices(): PendingDevice[] {
    return Array.from(this.pendingDevices.values());
  }

  updateDevice(id: string, updates: Partial<Pick<Device, 'name' | 'lastSeen'>>): Device | undefined {
    const device = this.devices.get(id);
    if (!device) return undefined;
    Object.assign(device, updates);
    return device;
  }

  removeDevice(id: string): boolean {
    if (id === 'host') return false;
    const device = this.devices.get(id);
    if (!device) return false;
    this.sessionTokenIndex.delete(device.sessionToken);
    this.devices.delete(id);
    return true;
  }

  /** Remove stale pending devices (past timeout) */
  cleanupPending(): void {
    const now = Date.now();
    for (const [id, pending] of this.pendingDevices.entries()) {
      if (now - pending.createdAt > config.pairTimeoutMs) {
        this.pendingDevices.delete(id);
      }
    }
  }

  updateLastSeen(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeen = Date.now();
    }
  }
}

function detectDeviceInfo(userAgent: string): { type: DeviceType; os: DeviceOS } {
  const ua = userAgent.toLowerCase();
  let type: DeviceType = 'unknown';
  let os: DeviceOS = 'unknown';

  if (/iphone|ipod/.test(ua)) { type = 'mobile'; os = 'ios'; }
  else if (/ipad/.test(ua)) { type = 'tablet'; os = 'ios'; }
  else if (/android/.test(ua)) {
    type = /mobile/.test(ua) ? 'mobile' : 'tablet';
    os = 'android';
  } else if (/windows/.test(ua)) { type = 'desktop'; os = 'windows'; }
  else if (/linux/.test(ua)) { type = 'desktop'; os = 'linux'; }
  else if (/mac/.test(ua)) { type = 'desktop'; os = 'macos'; }

  return { type, os };
}

function generateDeviceName(os: DeviceOS, type: DeviceType): string {
  const adjectives = ['Swift', 'Bright', 'Cool', 'Sharp', 'Bold', 'Quick', 'Keen', 'Wise'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const osLabel = os === 'ios' ? 'iPhone' : os === 'android' ? 'Android' : os === 'windows' ? 'PC' : os === 'linux' ? 'Linux' : 'Device';
  return `${adj} ${osLabel}`;
}

// Singleton
export const deviceStore = new DeviceStore();
