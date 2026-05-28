import request from 'supertest';

// Mock DB and services before importing app
jest.mock('../models/db', () => ({
  pool: {
    connect: jest.fn(),
    query: jest.fn(),
    on: jest.fn(),
  },
  testConnection: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../models/migrate', () => ({
  migrate: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../models/tenant.model', () => ({
  TenantModel: {
    create: jest.fn().mockResolvedValue({
      id: 'tenant-uuid-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
      api_key: 'rag_testkey123',
      created_at: new Date(),
      updated_at: new Date(),
    }),
    findById: jest.fn().mockResolvedValue({
      id: 'tenant-uuid-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
      created_at: new Date(),
    }),
    findByApiKey: jest.fn().mockResolvedValue({
      id: 'tenant-uuid-1',
      name: 'Acme Corp',
      slug: 'acme-corp',
      api_key: 'rag_testkey123',
    }),
  },
}));

import { app } from '../index';

describe('Health Check', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Tenant API', () => {
  it('POST /tenant creates a tenant', async () => {
    const res = await request(app)
      .post('/tenant')
      .send({ name: 'Acme Corp' });
    expect(res.status).toBe(201);
    expect(res.body.api_key).toBeDefined();
    expect(res.body.id).toBe('tenant-uuid-1');
  });

  it('POST /tenant rejects missing name', async () => {
    const res = await request(app).post('/tenant').send({});
    expect(res.status).toBe(400);
  });

  it('GET /tenant/:id returns tenant without api_key', async () => {
    const res = await request(app).get('/tenant/tenant-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.api_key).toBeUndefined(); // never expose api_key on GET
    expect(res.body.name).toBe('Acme Corp');
  });
});

describe('Cross-Tenant Isolation', () => {
  it('should reject access to another tenant\'s documents', async () => {
    // Authenticated as tenant-uuid-1 but trying to access tenant-uuid-2
    const res = await request(app)
      .get('/tenant/tenant-uuid-2/documents')
      .set('X-API-Key', 'rag_testkey123');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('should reject missing API key', async () => {
    const res = await request(app).get('/tenant/tenant-uuid-1/documents');
    expect(res.status).toBe(401);
  });
});
