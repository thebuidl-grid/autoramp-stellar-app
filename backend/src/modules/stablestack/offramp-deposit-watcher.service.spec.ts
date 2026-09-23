import { Test, TestingModule } from '@nestjs/testing';
import { OfframpDepositWatcherService } from './offramp-deposit-watcher.service';
import { StablestackService } from './stablestack.service';

describe('OfframpDepositWatcherService', () => {
  let watcher: OfframpDepositWatcherService;
  let stablestackService: { findAndConfirmPendingDeposits: jest.Mock };

  beforeEach(async () => {
    stablestackService = { findAndConfirmPendingDeposits: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfframpDepositWatcherService,
        { provide: StablestackService, useValue: stablestackService },
      ],
    }).compile();

    watcher = module.get<OfframpDepositWatcherService>(OfframpDepositWatcherService);
  });

  it('delegates to StablestackService.findAndConfirmPendingDeposits', async () => {
    stablestackService.findAndConfirmPendingDeposits.mockResolvedValue({ checked: 3, confirmed: 1 });

    await watcher.checkPendingDeposits();

    expect(stablestackService.findAndConfirmPendingDeposits).toHaveBeenCalledTimes(1);
  });

  it('does not let a slow run overlap with the next tick', async () => {
    let resolveFirst: () => void;
    const firstRun = new Promise<{ checked: number; confirmed: number }>((resolve) => {
      resolveFirst = () => resolve({ checked: 1, confirmed: 0 });
    });
    stablestackService.findAndConfirmPendingDeposits.mockReturnValueOnce(firstRun);

    const firstCall = watcher.checkPendingDeposits(); // still "running"
    await watcher.checkPendingDeposits(); // should skip immediately (isRunning guard)

    expect(stablestackService.findAndConfirmPendingDeposits).toHaveBeenCalledTimes(1);

    resolveFirst!();
    await firstCall;
  });

  it('does not throw if the underlying scan fails', async () => {
    stablestackService.findAndConfirmPendingDeposits.mockRejectedValue(new Error('horizon down'));
    await expect(watcher.checkPendingDeposits()).resolves.toBeUndefined();
  });
});
