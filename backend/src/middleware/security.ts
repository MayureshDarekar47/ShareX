import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

/**
 * Security headers middleware using helmet.
 * Configured for a local-network server (not public internet).
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: false, // Disabled to allow inline scripts in dev; enable for production
  crossOriginEmbedderPolicy: false,
});

/**
 * Validate Content-Type for JSON endpoints.
 */
export function requireJson(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('application/json')) {
    res.status(415).json({ success: false, error: 'Content-Type must be application/json', code: 'INVALID_CONTENT_TYPE' });
    return;
  }
  next();
}

/**
 * Global error handler.
 */
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error('[ERROR]', err.message);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
