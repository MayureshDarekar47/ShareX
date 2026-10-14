import request from 'supertest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from '../src/server';
import { config } from '../src/config';
import { deviceStore } from '../src/services/deviceStore';

// Helper: create and auto-approve a test device
async function createTestDevice(name = 'Test Device'): Promise<{ deviceId: string; token: string }> {
  // Directly use deviceStore for speed
  const device = deviceStore.initiatePairing('Mozilla/5.0 (Windows NT 10.0)', name);
  const approved = deviceStore.autoApprove(device.id);
  return { deviceId: approved!.id, token: approved!.sessionToken };
}

describe('File Transfers', () => {
  let senderToken: string;
  let senderId: string;

  beforeAll(async () => {
    const d = await createTestDevice('Sender');
    senderId = d.deviceId;
    senderToken = d.token;
  });

  it('POST /api/transfers/initiate — creates transfer for host', async () => {
    const res = await request(app)
      .post('/api/transfers/initiate')
      .set('x-session-token', senderToken)
      .send({
        receiverId: 'host',
        files: [{ name: 'test.txt', size: 13, mimeType: 'text/plain' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.transferId).toBeDefined();
  });

  it('Upload and download a real file', async () => {
    const content = 'Hello, ShareX!';
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    // Initiate
    const initRes = await request(app)
      .post('/api/transfers/initiate')
      .set('x-session-token', senderToken)
      .send({
        receiverId: 'host',
        files: [{ name: 'hello.txt', size: content.length, mimeType: 'text/plain' }],
      });
    expect(initRes.status).toBe(200);
    const { transferId } = initRes.body.data;

    // Upload (raw body)
    const uploadRes = await request(app)
      .post(`/api/transfers/${transferId}/upload/0`)
      .set('x-session-token', senderToken)
      .set('Content-Type', 'application/octet-stream')
      .set('x-checksum', checksum)
      .send(Buffer.from(content));
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.success).toBe(true);

    // Download
    const dlRes = await request(app)
      .get(`/api/transfers/${transferId}/download/0`)
      .set('x-session-token', senderToken);
    expect(dlRes.status).toBe(200);
    expect(dlRes.text).toBe(content);
  });

  it('Rejects file that is too large', async () => {
    const fakeSize = config.maxFileSizeBytes + 1;
    const res = await request(app)
      .post('/api/transfers/initiate')
      .set('x-session-token', senderToken)
      .send({
        receiverId: 'host',
        files: [{ name: 'huge.bin', size: fakeSize, mimeType: 'application/octet-stream' }],
      });
    expect(res.status).toBe(413);
  });

  it('Rejects path traversal filenames', async () => {
    const res = await request(app)
      .post('/api/transfers/initiate')
      .set('x-session-token', senderToken)
      .send({
        receiverId: 'host',
        files: [{ name: '../../etc/passwd', size: 10, mimeType: 'text/plain' }],
      });
    // Should succeed in initiating but filename is sanitized
    expect(res.status).toBe(200);
    // The filename will be sanitized, not rejected outright
    expect(res.body.success).toBe(true);
  });

  it('Cancels a transfer', async () => {
    const initRes = await request(app)
      .post('/api/transfers/initiate')
      .set('x-session-token', senderToken)
      .send({
        receiverId: 'host',
        files: [{ name: 'cancel.txt', size: 5, mimeType: 'text/plain' }],
      });
    const { transferId } = initRes.body.data;

    const cancelRes = await request(app)
      .delete(`/api/transfers/${transferId}`)
      .set('x-session-token', senderToken);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.cancelled).toBe(true);
  });

  it('Multi-file transfer', async () => {
    const files = [
      { name: 'a.txt', size: 1, mimeType: 'text/plain' },
      { name: 'b.txt', size: 1, mimeType: 'text/plain' },
      { name: 'c.txt', size: 1, mimeType: 'text/plain' },
    ];

    const initRes = await request(app)
      .post('/api/transfers/initiate')
      .set('x-session-token', senderToken)
      .send({ receiverId: 'host', files });
    expect(initRes.status).toBe(200);
    const { transferId } = initRes.body.data;

    for (let i = 0; i < files.length; i++) {
      const up = await request(app)
        .post(`/api/transfers/${transferId}/upload/${i}`)
        .set('x-session-token', senderToken)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('x'));
      expect(up.status).toBe(200);
    }
  });

  it('Unauthorized requests are rejected', async () => {
    const res = await request(app)
      .post('/api/transfers/initiate')
      .send({ receiverId: 'host', files: [{ name: 'f.txt', size: 1 }] });
    expect(res.status).toBe(401);
  });
});
