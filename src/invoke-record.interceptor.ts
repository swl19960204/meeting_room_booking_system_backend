import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Response, Request } from 'express';

@Injectable()
export class InvokeRecordInterceptor implements NestInterceptor {
  private readonly logger = new Logger(InvokeRecordInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request: Request = context.switchToHttp().getRequest<Request>();
    const response: Response = context.switchToHttp().getResponse<Response>();
    const userAgent = request.headers['user-agent'];
    const { ip, method, path } = request;
    // this.logger.debug(
    //   `${method} ${path} ${ip} ${userAgent}: ${context.getClass().name} ${
    //     context.getHandler().name
    //   } invoked...`,
    // );
    // this.logger.debug(
    //   `user: ${request.user?.userId}, ${request.user?.username}`,
    // );
    const now = Date.now();
    return next.handle().pipe(
      tap((res) => {
        this.logger.debug(
          `${method} ${path} ${ip} ${userAgent}: ${response.statusCode}: ${
            Date.now() - now
          }ms`,
        );
        this.logger.debug(`Response: ${JSON.stringify(res)}`);
      }),
    );
  }
}
