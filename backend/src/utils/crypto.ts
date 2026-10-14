import crypto from 'crypto';
import fs from 'fs';

/**
 * Compute SHA-256 hash of a file stream.
 */
export function computeFileChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Compute SHA-256 hash from a Buffer.
 */
export function computeBufferChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate a cryptographically random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a unique transfer ID.
 */
export function generateTransferId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Sanitize a filename to prevent path traversal and dangerous characters.
 */
export function sanitizeFilename(name: string): string {
  // Remove path separators and null bytes
  let safe = name.replace(/[/\\?%*:|"<>\x00-\x1f]/g, '_');
  // Remove leading dots (hidden files on Linux/Mac)
  safe = safe.replace(/^\.+/, '_');
  // Truncate to 255 chars
  if (safe.length > 255) {
    const ext = safe.lastIndexOf('.');
    if (ext > 0) {
      safe = safe.substring(0, 240) + safe.substring(ext);
    } else {
      safe = safe.substring(0, 255);
    }
  }
  return safe || 'unnamed_file';
}

/**
 * Ensure a file path is within the expected base directory.
 */
export function assertSafePath(basePath: string, filePath: string): void {
  const resolvedBase = require('path').resolve(basePath);
  const resolvedFile = require('path').resolve(filePath);
  if (!resolvedFile.startsWith(resolvedBase + require('path').sep) && resolvedFile !== resolvedBase) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
}

/**
 * Make a collision-safe filename in the target directory.
 * If the filename exists, append a counter suffix.
 */
export function makeUniqueFilename(dir: string, filename: string): string {
  const path = require('path');
  const fs = require('fs');
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = filename;
  let counter = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base} (${counter})${ext}`;
    counter++;
  }
  return candidate;
}
