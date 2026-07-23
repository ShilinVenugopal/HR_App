import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ApiError } from '../utils/apiError';

/// Generic request validator — prevents malformed/malicious input (SQLi,
/// XSS payloads, oversized fields) from ever reaching a service layer.
/// Pass a schema shaped like { body?, params?, query? }.
export function validate(schema: AnyZodObject) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      if (parsed.body) req.body = parsed.body;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(ApiError.badRequest('Validation failed', err.flatten()));
      }
      next(err);
    }
  };
}
