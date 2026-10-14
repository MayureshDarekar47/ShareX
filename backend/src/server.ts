import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

import { config } from './config';
import { securityHeaders, errorHandler } from './middleware/security';
import { apiRateLimit } from './middleware/rateLimit';
import authRoutes from './routes/auth';
import deviceRoutes from './routes/devices';
import fileRoutes from './routes/files';
import { wsHandler } from './websocket/handler';
import { deviceStore } from './services/deviceStore';
import { transferService } from './services/transferService';
import { getNetworkAddresses, buildUrl } from './utils/network';

const app = express();
const server = http.createServer(app);

// ── Security headers
app.use(securityHeaders);

// ── CORS: Allow local network origins
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, mobile browsers)
      if (!origin) return callback(null, true);
      // Allow any local network origin
      const isLocal =
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(origin);
      callback(null, isLocal || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test');
    },
    credentials: true,
    exposedHeaders: ['X-Checksum-SHA256', 'Content-Disposition'],
  })
);

// ── Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Rate limiting on all API routes
app.use('/api', apiRateLimit);

// ── API routes
app.use('/api', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/transfers', fileRoutes);

// ── Serve React frontend static build
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      name: 'ShareX',
      version: config.version,
      status: 'running',
      message: 'Frontend not built. Run `npm run build` in the frontend directory.',
    });
  });
}

// ── Global error handler
app.use(errorHandler);

// ── Initialize WebSocket
wsHandler.initialize(server);

// ── Background cleanup job (unref so it doesn't block process exit in tests)
const cleanupInterval = setInterval(() => {
  deviceStore.cleanupPending();
  transferService.cleanupAbandoned();
}, config.cleanupIntervalMs);
cleanupInterval.unref();

// ── Start server (skip auto-listen in test mode — supertest handles binding)
const isTest = process.env.NODE_ENV === 'test';

if (!isTest) {
  server.listen(config.port, '0.0.0.0', () => {
    const addresses = getNetworkAddresses().filter((a) => a.family === 'IPv4');

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║           ShareX — Local File Sharing            ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`\n  Host:     ${config.hostName}`);
    console.log(`  Version:  ${config.version}`);
    console.log(`  PIN:      ${config.pin}`);
    console.log('\n  Local URLs:');
    console.log(`    http://localhost:${config.port}`);
    addresses.forEach((a) => {
      console.log(`    ${buildUrl(a.address, config.port)}  (${a.interface})`);
    });
    console.log('\n  Scan the QR code in your browser at:');
    console.log(`    http://localhost:${config.port}`);
    console.log('\n  ⚠  Bind only on private/trusted networks.');
    console.log('  ⚠  Ensure your firewall allows port', config.port, 'on private networks.');
    console.log('\n════════════════════════════════════════════════════\n');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n✗ Port ${config.port} is already in use. Set PORT env var.\n`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down ShareX...');
    server.close(() => { console.log('Server stopped.'); process.exit(0); });
  });
  process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
}

export { app, server };
