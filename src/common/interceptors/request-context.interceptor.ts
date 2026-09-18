import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';

interface RequestWithId extends Request {
  requestId?: string;
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Request');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const requestId = randomUUID();
    request.requestId = requestId;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const scenarioId = this.scenarioId(request);
        this.logger.log(
          `[${requestId}] ${request.method} ${request.path} scenario=${scenarioId} ${Date.now() - startedAt}ms ok`,
        );
      }),
      catchError((error: unknown) => {
        const scenarioId = this.scenarioId(request);
        this.logger.warn(
          `[${requestId}] ${request.method} ${request.path} scenario=${scenarioId} ${Date.now() - startedAt}ms failed`,
        );
        return throwError(() => error);
      }),
    );
  }

  private scenarioId(request: RequestWithId): string {
    const body = request.body as { scenario_id?: unknown } | undefined;
    return typeof body?.scenario_id === 'string' ? body.scenario_id : 'n/a';
  }
}
