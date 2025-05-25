import Ajv, { Schema, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { ValidationError } from '@/core/errors';
import { logger } from '@/core/logger';

export class InputValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  public validate(schema: Schema, data: any): { valid: boolean; errors?: ErrorObject[] } {
    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(data);
      if (!valid) {
        return { valid: false, errors: validate.errors || [] };
      }
      return { valid: true };
    } catch (error) {
      logger.error('Error compiling JSON schema or validating:', error);
      // This typically means the schema itself is invalid
      throw new ValidationError('Invalid schema definition for validation.', {
        internalError: (error as Error).message,
      });
    }
  }
}

export const inputValidator = new InputValidator(); 