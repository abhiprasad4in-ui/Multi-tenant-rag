import { Request, Response, NextFunction } from 'express';

/**
 * Middleware: ensures the tenantId in the URL matches the authenticated tenant.
 * This is the KEY cross-tenant isolation guard — even if someone has a valid
 * API key, they cannot access another tenant's data by changing the URL param.
 */
export function enforceTenantScope(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const urlTenantId = req.params.tenantId;
  const authenticatedTenantId = req.tenant?.id;

  if (!authenticatedTenantId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (urlTenantId !== authenticatedTenantId) {
    // Log potential cross-tenant access attempt
    console.warn(
      `⚠️ Cross-tenant access attempt: authenticated=${authenticatedTenantId}, requested=${urlTenantId}`
    );
    res.status(403).json({
      error: 'Forbidden',
      message: 'You can only access your own tenant resources',
    });
    return;
  }

  next();
}

/**
 * Global error handler
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Unhandled error:', err);

  if (err.name === 'ValidationError') {
    res.status(400).json({ error: 'Validation error', message: err.message });
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
}
