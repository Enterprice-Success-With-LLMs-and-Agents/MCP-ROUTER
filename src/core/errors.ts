export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code?: string, public details?: any) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found', details?: any) {
    super(404, message, 'NOT_FOUND', details);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request', details?: any) {
    super(400, message, 'BAD_REQUEST', details);
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Validation failed', details?: any) {
    super(422, message, 'VALIDATION_ERROR', details); // Or 400 depending on preference
  }
}

export class UpstreamServiceError extends HttpError {
  constructor(message = 'Upstream service error', statusCode = 502, details?: any) {
    super(statusCode, message, 'UPSTREAM_ERROR', details);
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
} 