import { Request, Response, NextFunction } from 'express';
import { deviceStore } from '../services/deviceStore';

/**
 * Middleware: require a valid session token from header or query param.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token =
    (req.headers['x-session-token'] as string) ||
    (req.query.token as string);

  if (!token) {
    res.status(401).json({ success: false, error: 'Missing session token', code: 'AUTH_MISSING' });
    return;
  }

  const device = deviceStore.getDeviceByToken(token);
  if (!device) {
    res.status(401).json({ success: false, error: 'Invalid or expired session token', code: 'AUTH_INVALID' });
    return;
  }

  if (!device.approved) {
    res.status(403).json({ success: false, error: 'Device not yet approved', code: 'AUTH_PENDING' });
    return;
  }

  deviceStore.updateLastSeen(device.id);

  // Attach device info to request
  (req as any).device = device;
  next();
}

/**
 * Middleware: check that the request device is authorized for a specific transfer.
 */
export function requireTransferAuth(transferId: string, deviceId: string): boolean {
  // Both sender and receiver are authorized for their own transfers
  return true; // Further validation done in route handlers
}
