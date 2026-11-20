import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter logging', () => {
  let debug: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  const run = (exception: unknown, url = '/user/wallets') => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status,
          getHeader: jest.fn(),
          setHeader: jest.fn(),
        }),
        getRequest: () => ({ method: 'GET', url }),
      }),
    };
    new HttpExceptionFilter().catch(exception, host as any);
    return { status, json };
  };

  it('logs 401s at debug only, and still responds 401', () => {
    const { status } = run(
      new UnauthorizedException('Invalid or missing token'),
    );
    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug.mock.calls[0][0]).toBe(
      'GET /user/wallets - 401: Invalid or missing token',
    );
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('logs other 4xx as a single warn line with no stack trace', () => {
    run(new BadRequestException('amount must be positive'));
    run(new NotFoundException('Not found'));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('logs 5xx and unknown errors at error level with the stack', () => {
    const boom = new Error('kaboom');
    run(boom);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('500'),
      boom.stack,
    );

    run(new InternalServerErrorException('oops'));
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('keeps the client response unchanged (generic message, no internals)', () => {
    const { json } = run(new Error('secret db detail'));
    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secret db detail');
  });
});
