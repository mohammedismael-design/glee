import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  LoggerService,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    // Mask PII fields in logs
    const safeBody = maskPii(req.body);
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          this.logger.log(
            `${req.method} ${req.url} ${context.switchToHttp().getResponse().statusCode} +${ms}ms`,
            'HTTP',
          );
        },
        error: (err) => {
          const ms = Date.now() - start;
          this.logger.warn(
            `${req.method} ${req.url} ERROR +${ms}ms`,
            'HTTP',
          );
        },
      }),
    );
  }
}

function maskPii(obj: any): any {
  if (!obj) return obj;
  const masked = { ...obj };
  const piiFields = ['password', 'email', 'phone', 'token', 'refreshToken'];
  piiFields.forEach((field) => {
    if (masked[field]) masked[field] = '***';
  });
  return masked;
}
