import { pool } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface Document {
  id: string;
  tenant_id: string;
  filename: string;
  file_size: number;
  chunk_count: number;
  status: 'processing' | 'ready' | 'failed';
  created_at: Date;
}

export interface DocumentChunk {
  id: string;
  tenant_id: string;
  document_id: string;
  content: string;
  embedding?: number[];
  chunk_index: number;
  metadata: Record<string, unknown>;
}

export class DocumentModel {
  static async create(
    tenantId: string,
    filename: string,
    fileSize: number
  ): Promise<Document> {
    const id = uuidv4();
    const result = await pool.query<Document>(
      `INSERT INTO documents (id, tenant_id, filename, file_size, status)
       VALUES ($1, $2, $3, $4, 'processing')
       RETURNING *`,
      [id, tenantId, filename, fileSize]
    );
    return result.rows[0];
  }

  static async updateStatus(
    id: string,
    tenantId: string,
    status: Document['status'],
    chunkCount?: number
  ): Promise<void> {
    await pool.query(
      `UPDATE documents SET status = $1, chunk_count = COALESCE($2, chunk_count)
       WHERE id = $3 AND tenant_id = $4`,
      [status, chunkCount, id, tenantId]
    );
  }

  // CRITICAL: Always scope by tenantId — prevents cross-tenant leakage
  static async listByTenant(tenantId: string): Promise<Document[]> {
    const result = await pool.query<Document>(
      `SELECT * FROM documents WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  static async deleteByIdAndTenant(
    documentId: string,
    tenantId: string
  ): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM documents WHERE id = $1 AND tenant_id = $2`,
      [documentId, tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async insertChunks(chunks: Omit<DocumentChunk, 'id'>[]): Promise<void> {
    if (chunks.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const chunk of chunks) {
        // Embedding stored as pgvector format
        const embeddingStr = `[${chunk.embedding?.join(',')}]`;
        await client.query(
          `INSERT INTO document_chunks
             (id, tenant_id, document_id, content, embedding, chunk_index, metadata)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4::vector, $5, $6)`,
          [
            chunk.tenant_id,
            chunk.document_id,
            chunk.content,
            embeddingStr,
            chunk.chunk_index,
            JSON.stringify(chunk.metadata),
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Similarity search — ALWAYS filters by tenantId first
  static async similaritySearch(
    tenantId: string,
    queryEmbedding: number[],
    limit: number = 5
  ): Promise<Array<{ content: string; similarity: number; document_id: string; filename: string }>> {
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const result = await pool.query(
      `SELECT
         dc.content,
         dc.document_id,
         d.filename,
         1 - (dc.embedding <=> $1::vector) AS similarity
       FROM document_chunks dc
       JOIN documents d ON d.id = dc.document_id
       WHERE dc.tenant_id = $2          -- MANDATORY tenant isolation
         AND d.tenant_id = $2           -- double-check at join level
         AND dc.embedding IS NOT NULL
       ORDER BY dc.embedding <=> $1::vector
       LIMIT $3`,
      [embeddingStr, tenantId, limit]
    );
    return result.rows;
  }
}
