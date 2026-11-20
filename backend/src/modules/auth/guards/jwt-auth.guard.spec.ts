import {
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard.handleRequest logging', () => {
  let guard: JwtAuthGuard;
  let debug: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    guard = new JwtAuthGuard({} as any);
    debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns the user untouched and logs nothing', () => {
    const user = { id: 'u1' };
    expect(guard.handleRequest(null, user, undefined)).toBe(user);
    expect(debug).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('treats a missing token as a quiet 401 (debug, single line, no error)', () => {
    expect(() =>
      guard.handleRequest(null, false, { message: 'No auth token' }),
    ).toThrow(UnauthorizedException);
    expect(error).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug.mock.calls[0][0]).toContain('No auth token');
  });

  it('treats expected HTTP errors from the strategy (e.g. suspended) as quiet', () => {
    const err = new ForbiddenException('Suspended');
    expect(() => guard.handleRequest(err, false, undefined)).toThrow(err);
    expect(error).not.toHaveBeenCalled();
  });

  it('still logs unexpected errors at error level with a stack', () => {
    const err = new Error('db down');
    expect(() => guard.handleRequest(err, false, undefined)).toThrow(err);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('db down'),
      err.stack,
    );
  });
});
