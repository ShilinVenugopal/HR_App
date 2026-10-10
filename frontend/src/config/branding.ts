/// Single source of truth for the application's display branding — the
/// visible name and logo shown to users (Login page, sidebar header,
/// exported-file metadata). Purely cosmetic: nothing here is read by
/// routing, auth, RBAC, or any backend logic. Internal identifiers
/// (package names, DB tables, API routes, env var names, etc.) are
/// intentionally left as-is elsewhere in the codebase.
export const APP_NAME = 'FORAYS ERP';
export const COMPANY_NAME = 'Forays Group';
export const LOGO_PATH = '/forays-group-logo.png';
