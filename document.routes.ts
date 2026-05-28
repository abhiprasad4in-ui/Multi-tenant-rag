import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticateTenant } from '../middleware/auth.middleware';
import { enforceTenantScope } from '../middleware/tenant.middleware';
import { DocumentModel } from '../models/document.model';
import { processDocument } from '../rag/chunker';

export const documentRouter = Router({ mergeParams: true });

// Multer: store files in memory (not disk) for security
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and TXT files are allowed'));
    }
  },
});

// All document routes require authentication + tenant scope enforcement
documentRouter.use(authenticateTenant);
documentRouter.use(enforceTenantScope);

// POST /tenant/:tenantId/documents — Upload a document
documentRouter.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded. Use multipart field "file".' });
      return;
    }

    const tenantId = req.tenant!.id;
    const { originalname, mimetype, size, buffer } = req.file;

    // 1. Create document record (status: processing)
    const doc = await DocumentModel.create(tenantId, originalname, size);

    // 2. Process asynchronously so we can return fast
    processDocument(tenantId, doc.id, buffer, mimetype, originalname)
      .then(async (chunkCount) => {
        await DocumentModel.updateStatus(doc.id, tenantId, 'ready', chunkCount);
        console.log(`✅ Document ${doc.id} processed: ${chunkCount} chunks`);
      })
      .catch(async (err) => {
        await DocumentModel.updateStatus(doc.id, tenantId, 'failed');
        console.error(`❌ Document ${doc.id} processing failed:`, err);
      });

    res.status(202).json({
      id: doc.id,
      filename: originalname,
      status: 'processing',
      message: 'Document upload accepted. Processing in background.',
    });
  }
);

// GET /tenant/:tenantId/documents — List all documents for tenant
documentRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenant!.id;
  const docs = await DocumentModel.listByTenant(tenantId);
  res.json({ documents: docs, count: docs.length });
});

// DELETE /tenant/:tenantId/documents/:documentId — Delete a document
documentRouter.delete(
  '/:documentId',
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant!.id;
    const { documentId } = req.params;

    const deleted = await DocumentModel.deleteByIdAndTenant(documentId, tenantId);

    if (!deleted) {
      res.status(404).json({ error: 'Document not found or not owned by your tenant' });
      return;
    }

    res.json({ message: 'Document deleted successfully', document_id: documentId });
  }
);
