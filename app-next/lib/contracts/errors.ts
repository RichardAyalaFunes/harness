// Typed errors shared by the domain, the API and the CLI. The API turns them into the uniform error contract:
// { error: { code, message, issues?, traceId } } with the status below. Anything else becomes a generic 500.
export type ErrorCode =
  | 'validation' | 'invalid' | 'forbidden' | 'not_found' | 'method_not_allowed' | 'conflict'
  | 'payload_too_large' | 'unsupported_media_type' | 'model_failure' | 'busy' | 'internal';

export interface Issue { path: string; message: string }

export const STATUS: Record<ErrorCode, number> = {
  validation: 400, invalid: 400, forbidden: 403, not_found: 404, method_not_allowed: 405, conflict: 409,
  payload_too_large: 413, unsupported_media_type: 415, model_failure: 502, busy: 503, internal: 500,
};

export class AppError extends Error {
  code: ErrorCode;
  issues?: Issue[];
  constructor(code: ErrorCode, message: string, issues?: Issue[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (issues) this.issues = issues;
  }
  get status(): number { return STATUS[this.code]; }
}

/** A business rule refused the request (bad input the schema cannot know about). 400. */
export class Invalid extends AppError { constructor(message: string) { super('invalid', message); } }
/** The thing asked about does not exist. 404. */
export class NotFound extends AppError { constructor(message: string) { super('not_found', message); } }
/** The thing exists but is in the wrong state (already decided, already done). 409. */
export class Conflict extends AppError { constructor(message: string) { super('conflict', message); } }
/** The live model failed or its answer was refused by the checks. 502. */
export class ModelFailure extends AppError { constructor(message: string) { super('model_failure', message); } }

export interface ErrorBody { error: { code: ErrorCode; message: string; issues?: Issue[]; traceId: string } }

export function errorBody(code: ErrorCode, message: string, traceId: string, issues?: Issue[]): ErrorBody {
  return { error: { code, message, ...(issues ? { issues } : {}), traceId } };
}
