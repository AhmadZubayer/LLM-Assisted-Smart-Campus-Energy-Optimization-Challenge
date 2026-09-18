import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { EnvConfig } from '../config/env.validation';
import { AppError } from '../errors/application-error';
import { redactSecret } from '../logging/redact';

interface RequestWithId extends Request {
  requestId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId ?? randomUUID();

    if (exception instanceof AppError) {
      this.logger.error(
        `[${requestId}] ${exception.code}: ${this.redact(exception.logDetail ?? exception.message)}`,
      );
      response
        .status(exception.httpStatus)
        .json(this.body(exception.code, exception.message, requestId));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = this.extractMessage(exception.getResponse());
      this.logger.warn(
        `[${requestId}] HTTP ${status}: ${this.redact(message)}`,
      );
      response
        .status(status)
        .json(
          this.body(
            status === 400 ? 'INVALID_REQUEST' : 'HTTP_ERROR',
            message,
            requestId,
          ),
        );
      return;
    }

    this.logger.error(
      `[${requestId}] Unhandled error: ${this.redact(this.describe(exception))}`,
    );
    response
      .status(500)
      .json(
        this.body('INTERNAL_ERROR', 'An unexpected error occurred.', requestId),
      );
  }

  private body(code: string, message: string, requestId: string) {
    return { error: { code, message, request_id: requestId } };
  }

  private extractMessage(body: unknown): string {
    if (typeof body === 'string') {
      return body;
    }
    if (body && typeof body === 'object' && 'message' in body) {
      const raw = body.message;
      return Array.isArray(raw) ? raw.join('; ') : String(raw);
    }
    return 'Invalid request.';
  }

  private describe(exception: unknown): string {
    return exception instanceof Error
      ? `${exception.name}: ${exception.message}`
      : 'unknown error';
  }

  private redact(text: string): string {
    return redactSecret(
      text,
      this.configService.get('GEMINI_API_KEY', { infer: true }),
    );
  }
}
