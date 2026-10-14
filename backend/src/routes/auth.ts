import { Router, Request, Response } from 'express';
import { config } from '../config';
import { deviceStore } from '../services/deviceStore';
import { pairRateLimit } from '../middleware/rateLimit';
import { wsHandler } from '../websocket/handler';
import { getNetworkAddresses, buildUrl } from '../utils/network';
import { generateQRCode } from '../utils/qrcode';

const router = Router();

function isLocalhostRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || '';
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === 'localhost' ||
    req.hostname === 'localhost' ||
    req.hostname === '127.0.0.1'
  );
}

// GET /api/host/claim — allow host PC browser on localhost to claim host session
router.get('/host/claim', (req: Request, res: Response) => {
  if (!isLocalhostRequest(req)) {
    res.status(403).json({ success: false, error: 'Host session can only be claimed directly on host PC' });
    return;
  }

  const hostDevice = deviceStore.getDeviceById('host');
  res.json({
    success: true,
    data: {
      isHost: true,
      deviceId: 'host',
      sessionToken: config.sessionSecret,
      pin: config.pin,
      device: hostDevice,
    },
  });
});

// GET /api/host-info — public endpoint for initial connection
router.get('/host-info', (req: Request, res: Response) => {
  const addresses = getNetworkAddresses()
    .filter((a) => a.family === 'IPv4')
    .map((a) => buildUrl(a.address, config.port));

  res.json({
    success: true,
    data: {
      hostName: config.hostName,
      version: config.version,
      addresses,
      port: config.port,
      maxFileSizeBytes: config.maxFileSizeBytes,
      maxStorageBytes: config.maxStorageBytes,
      requiresPin: config.requirePin,
    },
  });
});

// GET /api/qrcode — generate QR code for given URL
router.get('/qrcode', async (req: Request, res: Response) => {
  try {
    const addresses = getNetworkAddresses().filter((a) => a.family === 'IPv4');
    const primary = addresses[0];
    const url = primary ? buildUrl(primary.address, config.port) : `http://localhost:${config.port}`;
    const dataUrl = await generateQRCode(url);
    res.json({ success: true, data: { qrcode: dataUrl, url } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'QR generation failed' });
  }
});

// POST /api/pair/init — initiate device pairing
router.post('/pair/init', pairRateLimit, (req: Request, res: Response) => {
  const { name } = req.body || {};
  const userAgent = req.headers['user-agent'] || '';

  const device = deviceStore.initiatePairing(userAgent, name);

  res.json({
    success: true,
    data: {
      deviceId: device.id,
      sessionToken: device.sessionToken, // pre-token, only valid after approval
      hostName: config.hostName,
      requiresPin: config.requirePin,
      requiresApproval: config.requireApproval,
    },
  });
});

// POST /api/pair/verify-pin — submit PIN
router.post('/pair/verify-pin', pairRateLimit, (req: Request, res: Response) => {
  const { deviceId, pin } = req.body || {};

  if (!deviceId || !pin) {
    res.status(400).json({ success: false, error: 'deviceId and pin are required' });
    return;
  }

  const result = deviceStore.verifyPin(deviceId, String(pin));

  if (!result.ok) {
    res.status(401).json({ success: false, error: result.error, attemptsLeft: result.attemptsLeft });
    return;
  }

  // If approval required, notify host and wait
  if (config.requireApproval) {
    const pending = deviceStore.getPendingDevice(deviceId);
    if (pending) {
      // Notify host WebSocket clients about pending device
      wsHandler.broadcastAll({
        type: 'device_joined',
        payload: {
          pending: true,
          device: { ...pending.device, sessionToken: undefined as any },
        },
        timestamp: Date.now(),
      });
    }
    res.json({
      success: true,
      data: {
        deviceId,
        approved: false,
        waitingApproval: true,
        message: 'Waiting for host to approve your device',
      },
    });
  } else {
    // Auto-approve
    const device = deviceStore.autoApprove(deviceId);
    if (!device) {
      res.status(500).json({ success: false, error: 'Failed to approve device' });
      return;
    }
    res.json({
      success: true,
      data: {
        deviceId: device.id,
        sessionToken: device.sessionToken,
        approved: true,
        device: { ...device, sessionToken: undefined },
      },
    });
  }
});

// POST /api/pair/approve — host approves or rejects a device (requires host auth)
router.post('/pair/approve', (req: Request, res: Response) => {
  const hostToken = req.headers['x-host-token'] || req.headers['x-session-token'];
  const isLoopback = isLocalhostRequest(req);
  if (!isLoopback && hostToken !== config.sessionSecret) {
    res.status(403).json({ success: false, error: 'Host authorization required' });
    return;
  }

  const { deviceId, approve } = req.body || {};
  if (!deviceId || typeof approve !== 'boolean') {
    res.status(400).json({ success: false, error: 'deviceId and approve (boolean) are required' });
    return;
  }

  const device = deviceStore.approveDevice(deviceId, approve);

  if (approve && device) {
    // Notify the device's WS connection if any (unlikely since not authorized yet)
    wsHandler.broadcastAll({
      type: 'device_updated',
      payload: { device: { ...device, sessionToken: undefined } },
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      data: { approved: true, device: { ...device, sessionToken: undefined } },
    });
  } else {
    res.json({ success: true, data: { approved: false } });
  }
});

// GET /api/pair/status/:deviceId — poll approval status
router.get('/pair/status/:deviceId', pairRateLimit, (req: Request, res: Response) => {
  const { deviceId } = req.params;

  // Check if fully approved (moved to devices)
  const approvedDevice = deviceStore.getDeviceById(deviceId);
  if (approvedDevice && approvedDevice.approved) {
    res.json({
      success: true,
      data: {
        approved: true,
        sessionToken: approvedDevice.sessionToken,
        device: { ...approvedDevice, sessionToken: undefined },
      },
    });
    return;
  }

  // Check if still pending
  const pending = deviceStore.getPendingDevice(deviceId);
  if (pending) {
    res.json({
      success: true,
      data: { approved: false, waitingApproval: true },
    });
    return;
  }

  res.status(404).json({ success: false, error: 'Device not found', code: 'NOT_FOUND' });
});

export default router;
