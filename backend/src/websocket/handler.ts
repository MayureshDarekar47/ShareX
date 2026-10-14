import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import { WSMessage, WSMessageType } from '../types';
import { deviceStore } from '../services/deviceStore';

interface AuthenticatedWebSocket extends WebSocket {
  deviceId?: string;
  sessionToken?: string;
  isAlive?: boolean;
}

class WSHandler {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, AuthenticatedWebSocket>(); // deviceId -> ws

  initialize(server: http.Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
      ws.isAlive = true;

      // Extract token from query or header
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token') || req.headers['x-session-token'] as string;

      if (!token) {
        ws.close(4001, 'Missing session token');
        return;
      }

      const device = deviceStore.getDeviceByToken(token);
      if (!device || !device.approved) {
        ws.close(4003, 'Unauthorized');
        return;
      }

      ws.deviceId = device.id;
      ws.sessionToken = token;
      this.clients.set(device.id, ws);

      deviceStore.updateLastSeen(device.id);

      // Notify all clients that a device joined
      this.broadcast({
        type: 'device_joined',
        payload: { device: { ...device, sessionToken: undefined as any } },
        timestamp: Date.now(),
      }, device.id);

      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('message', (data) => {
        try {
          const msg: WSMessage = JSON.parse(data.toString());
          this.handleMessage(ws, msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        if (ws.deviceId) {
          this.clients.delete(ws.deviceId);
          this.broadcast({
            type: 'device_left',
            payload: { deviceId: ws.deviceId },
            timestamp: Date.now(),
          });
          deviceStore.updateLastSeen(ws.deviceId);
        }
      });

      ws.on('error', (err) => {
        console.error(`WS error for device ${ws.deviceId}:`, err.message);
      });

      // Send current device list to the newly connected client
      this.sendTo(device.id, {
        type: 'device_joined',
        payload: { devices: deviceStore.getAllDevices().map(d => ({ ...d, sessionToken: undefined })) },
        timestamp: Date.now(),
      });
    });

    // Heartbeat: ping all clients every 30s
    const interval = setInterval(() => {
      this.wss!.clients.forEach((rawWs) => {
        const ws = rawWs as AuthenticatedWebSocket;
        if (!ws.isAlive) { ws.terminate(); return; }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30_000);
    interval.unref(); // don't prevent process exit

    this.wss.on('error', (err: Error) => {
      // The WSS shares the HTTP server; EADDRINUSE is handled by server.on('error')
      // Suppress to avoid duplicate unhandled error throw
      console.error('[WSS error]', err.message);
    });

    this.wss.on('close', () => clearInterval(interval));
  }

  private handleMessage(ws: AuthenticatedWebSocket, msg: WSMessage): void {
    if (msg.type === 'ping') {
      this.sendToWs(ws, { type: 'pong', payload: {}, timestamp: Date.now() });
    }
  }

  /**
   * Send a message to a specific device.
   */
  sendTo(deviceId: string, msg: WSMessage): boolean {
    const ws = this.clients.get(deviceId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  sendToWs(ws: AuthenticatedWebSocket, msg: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Broadcast to all connected clients except the excluded device.
   */
  broadcast(msg: WSMessage, excludeDeviceId?: string): void {
    const json = JSON.stringify(msg);
    this.clients.forEach((ws, deviceId) => {
      if (deviceId !== excludeDeviceId && ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    });
  }

  /**
   * Send to ALL connected clients (including sender).
   */
  broadcastAll(msg: WSMessage): void {
    const json = JSON.stringify(msg);
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    });
  }

  isConnected(deviceId: string): boolean {
    const ws = this.clients.get(deviceId);
    return !!ws && ws.readyState === WebSocket.OPEN;
  }

  getConnectedDeviceIds(): string[] {
    return Array.from(this.clients.keys()).filter((id) => {
      const ws = this.clients.get(id);
      return ws && ws.readyState === WebSocket.OPEN;
    });
  }
}

export const wsHandler = new WSHandler();
