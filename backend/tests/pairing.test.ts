import request from 'supertest';
import { app } from '../src/server';
import { config } from '../src/config';

describe('Pairing & Authorization', () => {
  let deviceId: string;
  let sessionToken: string;

  it('GET /api/host-info — returns host info', async () => {
    const res = await request(app).get('/api/host-info');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBeDefined();
    expect(res.body.data.requiresPin).toBeDefined();
  });

  it('POST /api/pair/init — creates a pending device', async () => {
    const res = await request(app)
      .post('/api/pair/init')
      .send({ name: 'Test Device' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.deviceId).toBeDefined();
    deviceId = res.body.data.deviceId;
  });

  it('POST /api/pair/verify-pin — wrong pin is rejected', async () => {
    const res = await request(app)
      .post('/api/pair/verify-pin')
      .send({ deviceId, pin: '000000' })
      .set('Content-Type', 'application/json');

    if (config.requirePin) {
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    } else {
      // If PIN not required, skip
      expect(true).toBe(true);
    }
  });

  it('POST /api/pair/verify-pin — correct pin succeeds', async () => {
    const res = await request(app)
      .post('/api/pair/verify-pin')
      .send({ deviceId, pin: config.pin })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    if (!config.requireApproval) {
      expect(res.body.data.sessionToken).toBeDefined();
      sessionToken = res.body.data.sessionToken;
    }
  });

  it('GET /api/devices — requires auth', async () => {
    const res = await request(app).get('/api/devices');
    expect(res.status).toBe(401);
  });

  it('GET /api/devices — works with valid token', async () => {
    if (!sessionToken) return; // skip if approval required
    const res = await request(app)
      .get('/api/devices')
      .set('x-session-token', sessionToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.devices)).toBe(true);
  });
});
