import { Router, Request, Response } from 'express';
import { deviceStore } from '../services/deviceStore';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/devices — list all approved connected devices
router.get('/', requireAuth, (req: Request, res: Response) => {
  const devices = deviceStore.getAllDevices().map((d) => ({
    ...d,
    sessionToken: undefined, // Never expose tokens
  }));
  res.json({ success: true, data: { devices } });
});

// GET /api/devices/pending — list pending approval devices (host only)
router.get('/pending', (req: Request, res: Response) => {
  const hostToken = req.headers['x-host-token'] || req.headers['x-session-token'];
  const ip = req.ip || req.socket.remoteAddress || '';
  const isLoopback =
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === 'localhost' ||
    req.hostname === 'localhost' ||
    req.hostname === '127.0.0.1';

  if (!isLoopback && hostToken !== require('../config').config.sessionSecret) {
    res.status(403).json({ success: false, error: 'Host authorization required' });
    return;
  }
  const pending = deviceStore.getAllPendingDevices().map((p) => ({
    ...p.device,
    sessionToken: undefined,
    pinAttempts: p.pinAttempts,
  }));
  res.json({ success: true, data: { pending } });
});

// PATCH /api/devices/:id — update device name
router.patch('/:id', requireAuth, (req: Request, res: Response) => {
  const requester = (req as any).device;
  const { id } = req.params;
  const { name } = req.body || {};

  // Only allow renaming own device, or host can rename any
  if (requester.id !== id) {
    res.status(403).json({ success: false, error: 'Can only rename your own device' });
    return;
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ success: false, error: 'Valid name is required' });
    return;
  }

  const updated = deviceStore.updateDevice(id, { name: name.trim().substring(0, 50) });
  if (!updated) {
    res.status(404).json({ success: false, error: 'Device not found' });
    return;
  }

  // Broadcast update
  const { wsHandler } = require('../websocket/handler');
  wsHandler.broadcastAll({
    type: 'device_updated',
    payload: { device: { ...updated, sessionToken: undefined } },
    timestamp: Date.now(),
  });

  res.json({ success: true, data: { device: { ...updated, sessionToken: undefined } } });
});

// DELETE /api/devices/:id — disconnect a device
router.delete('/:id', requireAuth, (req: Request, res: Response) => {
  const requester = (req as any).device;
  const { id } = req.params;

  if (requester.id !== id) {
    res.status(403).json({ success: false, error: 'Can only disconnect your own device' });
    return;
  }

  const removed = deviceStore.removeDevice(id);
  if (!removed) {
    res.status(404).json({ success: false, error: 'Device not found' });
    return;
  }

  const { wsHandler } = require('../websocket/handler');
  wsHandler.broadcast(
    { type: 'device_left', payload: { deviceId: id }, timestamp: Date.now() },
    id
  );

  res.json({ success: true, data: { removed: true } });
});

export default router;
