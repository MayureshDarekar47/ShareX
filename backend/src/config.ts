import path from 'path';
import os from 'os';
import fs from 'fs';

// Ensure upload directories exist
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
const RECEIVED_DIR = path.resolve(process.env.RECEIVED_DIR || path.join(__dirname, '..', 'received'));
const TEMP_DIR = path.join(UPLOAD_DIR, 'temp');

[UPLOAD_DIR, RECEIVED_DIR, TEMP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export const config = {
  port: parseInt(process.env.PORT || '7788', 10),
  hostName: process.env.HOST_NAME || os.hostname(),
  version: '1.0.0',

  // Directories
  uploadDir: UPLOAD_DIR,
  receivedDir: RECEIVED_DIR,
  tempDir: TEMP_DIR,

  // Security
  pin: process.env.SHAREX_PIN || generatePin(),
  sessionSecret: process.env.SESSION_SECRET || generateSecret(),
  requirePin: process.env.REQUIRE_PIN !== 'false',
  requireApproval: process.env.REQUIRE_APPROVAL !== 'false',

  // Limits
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_MB || '2048', 10) * 1024 * 1024,
  maxStorageBytes: parseInt(process.env.MAX_STORAGE_GB || '10', 10) * 1024 * 1024 * 1024,
  maxFilesPerTransfer: parseInt(process.env.MAX_FILES_PER_TRANSFER || '100', 10),

  // Timeouts
  pairTimeoutMs: 120_000,       // 2 minutes to complete pairing
  transferTimeoutMs: 3_600_000, // 1 hour max transfer time
  cleanupIntervalMs: 300_000,   // 5 minutes cleanup interval
  abandonedTransferMs: 3_600_000, // 1 hour before abandoned

  // Rate limiting
  pairRateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
  },
  uploadRateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 100,
  },
};

function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let secret = '';
  for (let i = 0; i < 64; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

export type Config = typeof config;
