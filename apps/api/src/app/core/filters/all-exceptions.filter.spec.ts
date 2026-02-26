import { AgentTimeoutError } from '@ghostfolio/api/app/endpoints/ai/agent/react-agent.service';

import {
  BadRequestException,
  HttpStatus,
  NotFoundException
} from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  const mockRequest = { url: '/api/v1/ai/chat' };

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  });

  function buildHost() {
    return {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue({ status: mockStatus })
      })
    } as any;
  }

  // ─── HttpException passthrough ──────────────────────────────────────────────

  it('passes BadRequestException through as 400', () => {
    filter.catch(new BadRequestException('Invalid input'), buildHost());

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Bad Request',
        message: expect.stringContaining('Invalid input'),
        statusCode: 400
      })
    );
  });

  it('passes NotFoundException through as 404', () => {
    filter.catch(new NotFoundException('Conversation not found'), buildHost());

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Not Found',
        message: expect.stringContaining('Conversation not found'),
        statusCode: 404
      })
    );
  });

  // ─── AgentTimeoutError → 408 ───────────────────────────────────────────────

  it('maps AgentTimeoutError to 408 Request Timeout', () => {
    filter.catch(new AgentTimeoutError('Agent timed out'), buildHost());

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.REQUEST_TIMEOUT);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Request Timeout',
        message: 'Agent timed out',
        statusCode: 408
      })
    );
  });

  // ─── Raw Error → 500 sanitized ─────────────────────────────────────────────

  it('maps raw Error to 500 without leaking the message', () => {
    filter.catch(new Error('Missing OPENAI_API_KEY'), buildHost());

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

    const body = mockJson.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(body.message).not.toContain('OPENAI_API_KEY');
  });

  // ─── Non-Error throwable → 500 ─────────────────────────────────────────────

  it('maps non-Error throwables to 500', () => {
    filter.catch('unexpected string throw', buildHost());

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal server error',
        statusCode: 500
      })
    );
  });

  // ─── Consistent response shape ─────────────────────────────────────────────

  it('includes timestamp and path in every response', () => {
    filter.catch(new BadRequestException('test'), buildHost());

    const body = mockJson.mock.calls[0][0];
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('path', '/api/v1/ai/chat');
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  // ─── No stack trace leak ────────────────────────────────────────────────────

  it('never exposes stack traces in the response body', () => {
    const error = new Error('kaboom');
    error.stack = 'Error: kaboom\n    at Object.<anonymous> ...';

    filter.catch(error, buildHost());

    const body = mockJson.mock.calls[0][0];
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('at Object');
  });
});
