import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { authenticateTenant } from '../middleware/auth.middleware';
import { enforceTenantScope } from '../middleware/tenant.middleware';
import { queryKnowledgeBase } from '../rag/query';

export const queryRouter = Router({ mergeParams: true });

queryRouter.use(authenticateTenant);
queryRouter.use(enforceTenantScope);

const querySchema = Joi.object({
  question: Joi.string().min(3).max(2000).required(),
  top_k: Joi.number().integer().min(1).max(10).default(5),
});

// POST /tenant/:tenantId/query — Query the knowledge base
queryRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const { error, value } = querySchema.validate(req.body);
  if (error) {
    res.status(400).json({ error: 'Validation error', message: error.message });
    return;
  }

  const tenantId = req.tenant!.id;
  const { question } = value;

  try {
    const result = await queryKnowledgeBase(tenantId, question);

    res.json({
      question,
      answer: result.answer,
      confidence: result.confidence,
      sources: result.sources,
      tenant_id: tenantId, // echo back so client can verify correct tenant
    });
  } catch (err) {
    console.error('Query error:', err);
    res.status(500).json({
      error: 'Query failed',
      message: 'An error occurred while processing your question',
    });
  }
});
