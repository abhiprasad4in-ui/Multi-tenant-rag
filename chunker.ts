import pdfParse from 'pdf-parse';
import { generateEmbeddings } from '../services/openai.service';
import { DocumentModel } from '../models/document.model';

const CHUNK_SIZE = 500;       // characters per chunk
const CHUNK_OVERLAP = 100;    // overlap between chunks to preserve context

/**
 * Split text into overlapping chunks for better retrieval
 */
export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  // Normalize whitespace
  const cleaned = text.replace(/\s+/g, ' ').trim();

  while (start < cleaned.length) {
    const end = Math.min(start + CHUNK_SIZE, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();

    if (chunk.length > 50) { // ignore tiny chunks
      chunks.push(chunk);
    }

    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

/**
 * Extract text from PDF buffer
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Extract text from plain text buffer
 */
export function extractTextFromTxt(buffer: Buffer): string {
  return buffer.toString('utf-8');
}

/**
 * Full pipeline: extract → chunk → embed → store
 */
export async function processDocument(
  tenantId: string,
  documentId: string,
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<number> {
  // 1. Extract text
  let text: string;
  if (mimetype === 'application/pdf') {
    text = await extractTextFromPDF(buffer);
  } else {
    text = extractTextFromTxt(buffer);
  }

  if (!text || text.trim().length < 10) {
    throw new Error('Could not extract meaningful text from document');
  }

  // 2. Chunk text
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    throw new Error('Document produced no chunks');
  }

  // 3. Generate embeddings in batches (OpenAI allows up to 2048 inputs)
  const BATCH_SIZE = 50;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const embeddings = await generateEmbeddings(batch);
    allEmbeddings.push(...embeddings);
  }

  // 4. Store chunks with embeddings — always tagged with tenantId
  const chunkRecords = chunks.map((content, index) => ({
    tenant_id: tenantId,
    document_id: documentId,
    content,
    embedding: allEmbeddings[index],
    chunk_index: index,
    metadata: { filename, chunk_index: index, total_chunks: chunks.length },
  }));

  await DocumentModel.insertChunks(chunkRecords);

  return chunks.length;
}
