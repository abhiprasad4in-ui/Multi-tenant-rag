import { pool } from './db';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  api_key: string;
  created_at: Date;
  updated_at: Date;
}

export class TenantModel {
  static generateApiKey(): string {
    return `rag_${crypto.randomBytes(32).toString('hex')}`;
  }

  static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  }

  static async create(name: string): Promise<Tenant> {
    const id = uuidv4();
    const slug = this.generateSlug(name);
    const apiKey = this.generateApiKey();

    const result = await pool.query<Tenant>(
      `INSERT INTO tenants (id, name, slug, api_key)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, name, slug, apiKey]
    );
    return result.rows[0];
  }

  static async findById(id: string): Promise<Tenant | null> {
    const result = await pool.query<Tenant>(
      'SELECT * FROM tenants WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByApiKey(apiKey: string): Promise<Tenant | null> {
    const result = await pool.query<Tenant>(
      'SELECT * FROM tenants WHERE api_key = $1',
      [apiKey]
    );
    return result.rows[0] || null;
  }
}
