import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { TenantModel } from '../models/tenant.model';

export const tenantRouter = Router();

const createTenantSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
});

// POST /tenant — Create a new tenant
tenantRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const { error, value } = createTenantSchema.validate(req.body);
  if (error) {
    res.status(400).json({ error: 'Validation error', message: error.message });
    return;
  }

  try {
    const tenant = await TenantModel.create(value.name);
    res.status(201).json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      api_key: tenant.api_key, // only returned on creation!
      created_at: tenant.created_at,
      message: 'Store your API key securely — it will not be shown again.',
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') {
      res.status(409).json({ error: 'Tenant with this name already exists' });
      return;
    }
    throw err;
  }
});

// GET /tenant/:id — Get tenant info (no API key returned)
tenantRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const tenant = await TenantModel.findById(req.params.id);

  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  res.json({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    created_at: tenant.created_at,
  });
});
