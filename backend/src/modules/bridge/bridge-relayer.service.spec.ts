import { Test, TestingModule } from '@nestjs/testing';
import { BridgeRelayerService } from './bridge-relayer.service';
import { BridgeService } from './bridge.service';

describe('BridgeRelayerService', () => {
  let relayer: BridgeRelayerService;
  let bridgeService: { findAndCompletePendingTransfers: jest.Mock };

  beforeEach(async () => {
    bridgeService = { findAndCompletePendingTransfers: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BridgeRelayerService, { provide: BridgeService, useValue: bridgeService }],
    }).compile();

    relayer = module.get(BridgeRelayerService);
  });

  it('delegates to BridgeService.findAndCompletePendingTransfers', async () => {
    bridgeService.findAndCompletePendingTransfers.mockResolvedValue({ checked: 2, completed: 1 });

    await relayer.checkPendingTransfers();

    expect(bridgeService.findAndCompletePendingTransfers).toHaveBeenCalledTimes(1);
  });

  it('does not let a slow run overlap with the next tick', async () => {
    let resolveFirst: () => void;
    const firstRun = new Promise<{ checked: number; completed: number }>((resolve) => {
      resolveFirst = () => resolve({ checked: 1, completed: 0 });
    });
    bridgeService.findAndCompletePendingTransfers.mockReturnValueOnce(firstRun);

    const firstCall = relayer.checkPendingTransfers();
    await relayer.checkPendingTransfers(); // should skip immediately (isRunning guard)

    expect(bridgeService.findAndCompletePendingTransfers).toHaveBeenCalledTimes(1);

    resolveFirst!();
    await firstCall;
  });

  it('does not throw if the underlying scan fails', async () => {
    bridgeService.findAndCompletePendingTransfers.mockRejectedValue(new Error('circle iris down'));
    await expect(relayer.checkPendingTransfers()).resolves.toBeUndefined();
  });
});
