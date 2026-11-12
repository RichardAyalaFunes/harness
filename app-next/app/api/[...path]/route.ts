import { apiNotFound } from '../../../lib/api/routes.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Unknown API paths get the contract's 404 (with a trace id). Methods a known route does not export are answered by Next with 405.
export const GET = apiNotFound;
export const POST = apiNotFound;
