import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminGuard } from 'src/modules/auth/guards/admin.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { BitNobService } from 'src/modules/bitnob/bitnob.service';
import { AdminBitnobController } from './admin-bitnob.controller';
import {
  BitnobPayoutsQueryDto,
  BitnobTransactionsQueryDto,
} from './dto/bitnob-queries.dto';

describe('AdminBitnobController', () => {
  it('is admin-only (JWT + admin guard on the whole controller)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminBitnobController);
    expect(guards).toEqual([JwtAuthGuard, AdminGuard]);
  });

  it('passes the validated query through to Bitnob', async () => {
    const bitnob = {
      listBalances: jest.fn().mockResolvedValue({ data: { accounts: [] } }),
      listTransactions: jest.fn().mockResolvedValue({ data: {} }),
      listPayouts: jest.fn().mockResolvedValue({ data: {} }),
    };
    const c = new AdminBitnobController(bitnob as unknown as BitNobService);
    await c.balances();
    await c.transactions({ limit: 25, cursor: 'abc' });
    await c.payouts({ limit: 20, offset: 40, status: 'success' });
    expect(bitnob.listBalances).toHaveBeenCalled();
    expect(bitnob.listTransactions).toHaveBeenCalledWith({
      limit: 25,
      cursor: 'abc',
    });
    expect(bitnob.listPayouts).toHaveBeenCalledWith({
      limit: 20,
      offset: 40,
      status: 'success',
    });
  });
});

describe('Bitnob query DTOs', () => {
  it('coerces numbers and rejects out-of-range ones', async () => {
    const ok = plainToInstance(BitnobPayoutsQueryDto, {
      limit: '20',
      offset: '0',
    });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.limit).toBe(20);
    expect(
      await validate(plainToInstance(BitnobPayoutsQueryDto, { limit: '500' })),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(BitnobTransactionsQueryDto, { limit: '0' }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(BitnobPayoutsQueryDto, { offset: '-1' })),
    ).not.toHaveLength(0);
  });
});
