import { Request } from 'express';
import { UAParser } from 'ua-parser-js';

export interface RequestMeta {
  ipAddress: string;
  device: string;
  browser: string;
}

export function extractRequestMeta(req: Request): RequestMeta {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ipAddress =
    (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : undefined) ??
    req.socket.remoteAddress ??
    'unknown';

  const ua = new UAParser(req.headers['user-agent'] ?? '');
  const browser = [ua.getBrowser().name, ua.getBrowser().version].filter(Boolean).join(' ') || 'unknown';
  const device =
    [ua.getOS().name, ua.getOS().version].filter(Boolean).join(' ') ||
    ua.getDevice().type ||
    'unknown';

  return { ipAddress, device, browser };
}
