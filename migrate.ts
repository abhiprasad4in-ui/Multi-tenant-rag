import { pool } from './db';

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Tenants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        api_key VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Documents table (metadata only)
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        filename VARCHAR(500) NOT NULL,
        file_size INTEGER,
        chunk_count INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'processing',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Document chunks with vectors — the core of RAG
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding vector(1536),
        chunk_index INTEGER NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Index for fast tenant-scoped vector similarity search
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_tenant_id ON document_chunks(tenant_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id)
    `);

    // IVFFlat index for approximate nearest neighbour search (cosine)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding
      ON document_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `).catch(() => {
      // Index may fail if table is empty; it's created after data insertion too
      console.log('IVFFlat index will be created after data is loaded');
    });

    await client.query('COMMIT');
    console.log('✅ Database migrated successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run directly: ts-node src/models/migrate.ts
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
