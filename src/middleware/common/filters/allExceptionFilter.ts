import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { capitalizedMessage } from '../../helpers';
import { CustomLoggerService } from 'src/lib/loggger/logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: CustomLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let status: number;
    let message: any;
    let statusType: string;

    if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      message = this.handleTypeOrmError(exception);
      statusType = HttpStatus[HttpStatus.BAD_REQUEST] || 'Bad Request';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseMessage = exception.getResponse();
      message =
        typeof responseMessage === 'string'
          ? responseMessage
          : (responseMessage as any).message || 'Unknown error';
      statusType = HttpStatus[status] || 'Unknown Error';
    } else if (exception instanceof Error) {
      const error = exception as any;
      const isStripeError =
        error.type?.startsWith('Stripe') ||
        error.code?.startsWith('card_') ||
        error.code?.startsWith('payment_') ||
        error.code?.startsWith('invalid_') ||
        error.constructor?.name === 'StripeAPIError' ||
        error.constructor?.name === 'StripeCardError' ||
        error.constructor?.name === 'StripeInvalidRequestError' ||
        error.constructor?.name?.includes('Stripe');

      if (isStripeError) {
        status = HttpStatus.BAD_REQUEST;
        message = exception.message || 'Payment processing error';
        statusType = HttpStatus[HttpStatus.BAD_REQUEST] || 'Bad Request';
      } else {
        // Generic error — log the real message internally but never send it to the client
        // (error messages can contain DATABASE_URL, API keys, or other secrets)
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Internal server error';
        statusType = 'Internal Server Error';
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      statusType = 'Internal Server Error';
    }

    const errorResponse = {
      statusCode: status,
      statusType,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    this.logger.error(
      `Exception: ${JSON.stringify(errorResponse)}`,
      exception instanceof Error ? (exception.stack ?? '') : '',
    );

    response.status(status).json(errorResponse);
  }

  private handleTypeOrmError(exception: QueryFailedError): string {
    const driverError = exception.driverError as
      | { code?: string; detail?: string; constraint?: string }
      | undefined;
    const code = driverError?.code;

    switch (code) {
      case '23505': {
        // unique_violation
        const constraint = driverError?.constraint ?? '';
        const field = constraint.replace(/.*_([^_]+)_key$/, '$1') || constraint;
        return field
          ? `${capitalizedMessage(field)} already exists`
          : 'Record already exists';
      }
      case '23503':
        // foreign_key_violation
        return 'Related record was not found';
      case '23502':
        // not_null_violation
        return 'Required field is missing';
      default:
        return 'Database error occurred';
    }
  }
}
