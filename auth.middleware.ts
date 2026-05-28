import { Request, Response, NextFunction } from 'express';
import { TenantModel } from '../models/tenant.model';

// Extend Express Request to carry tenant info
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        name: string;
        slug: string;
      };
    }
  }
}

/**
 * Middleware: validates X-API-Key header and attaches tenant to request.
 * All tenant-scoped routes must pass through this.
 */
export async function authenticateTenant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
    });
    return;
  }

  try {
    const tenant = await TenantModel.findByApiKey(apiKey);

    if (!tenant) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
      return;
    }

    // CRITICAL: Attach tenant to request — all downstream handlers use this
    req.tenant = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
