import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

// Rate limit for pairing endpoints
export const pairRateLimit = rateLimit({
  windowMs: config.pairRateLimit.windowMs,
  max: config.pairRateLimit.max,
  message: { success: false, error: 'Too many pairing attempts. Please wait.', code: 'RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for upload endpoints
export const uploadRateLimit = rateLimit({
  windowMs: config.uploadRateLimit.windowMs,
  max: config.uploadRateLimit.max,
  message: { success: false, error: 'Too many upload requests. Please wait.', code: 'RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limit
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { success: false, error: 'Too many requests.', code: 'RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
});
