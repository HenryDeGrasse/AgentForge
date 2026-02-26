import { AgentTimeoutError } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  error: string;
  message: string;
  path: string;
  statusCode: number;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode: number;
    let message: string;
    let error: string;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const responseObj = exceptionResponse as Record<string, unknown>;

        message =
          typeof responseObj.message === 'string'
            ? responseObj.message
            : Array.isArray(responseObj.message)
              ? (responseObj.message as string[]).join('; ')
              : exception.message;
      } else {
        message = exception.message;
      }

      error = this.getReasonPhrase(statusCode);
    } else if (exception instanceof AgentTimeoutError) {
      statusCode = HttpStatus.REQUEST_TIMEOUT;
      message = exception.message;
      error = 'Request Timeout';
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';
    }

    const logMessage =
      exception instanceof Error
        ? `${exception.name}: ${exception.message}`
        : `Non-Error exception: ${String(exception)}`;

    this.logger.error(
      `[${request.url}] ${logMessage}`,
      exception instanceof Error ? exception.stack : undefined
    );

    const body: ErrorResponseBody = {
      error,
      message,
      path: request.url,
      statusCode,
      timestamp: new Date().toISOString()
    };

    response.status(statusCode).json(body);
  }

  private getReasonPhrase(statusCode: number): string {
    const phrases: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.REQUEST_TIMEOUT]: 'Request Timeout',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error'
    };

    return phrases[statusCode] ?? 'Error';
  }
}
