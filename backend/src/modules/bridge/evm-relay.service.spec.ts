import { BadRequestException, ForbiddenException } from '@nestjs/common';

const receiveMessage = jest.fn();
const usedNonces = jest.fn();
jest.mock('ethers', () => ({
  Contract: jest
    .fn()
    .mockImplementation(() => ({ receiveMessage, usedNonces })),
  JsonRpcProvider: jest.fn(),
  Wallet: jest
    .fn()
    .mockImplementation(() => ({
      address: '0x00000000000000000000000000000000000000aa',
    })),
}));

import {
  EvmRelayService,
  destinationCallerOf,
  isStellarToBase,
  networkOf,
} from './evm-relay.service';

const RECIPIENT = '0x4f2f9bf32e7e34e60ae6e28dd5ea02fffe681ea8';

/** A CCTP v2 burn message: 148-byte header then the burn body. */
function message(
  over: { dest?: number; recipient?: string; caller?: string } = {},
) {
  const header = Buffer.alloc(148);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(27, 4); // source: Stellar
  header.writeUInt32BE(over.dest ?? 6, 8); // destination: Base
  Buffer.from('ab'.repeat(32), 'hex').copy(header, 12); // nonce
  if (over.caller)
    Buffer.from(over.caller.padStart(64, '0'), 'hex').copy(header, 76);
  const body = Buffer.alloc(260);
  Buffer.from(
    (over.recipient ?? RECIPIENT).replace('0x', '').padStart(64, '0'),
    'hex',
  ).copy(body, 36);
  return `0x${Buffer.concat([header, body]).toString('hex')}`;
}

const transfer = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  reference: 'BRG-1',
  fromChain: 'Stellar',
  toChain: 'Base',
  transactionHash:
    'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
  destinationAddress: RECIPIENT,
  userId: 'u1',
  metadata: { SOURCE_TX: 'cff3' },
  status: 'PENDING',
  ...over,
});

function build(opts: { transfer?: any; secret?: string | null } = {}) {
  const update = jest.fn().mockResolvedValue({});
  const prisma: any = {
    bridgeTransaction: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.transfer === undefined ? transfer() : opts.transfer,
        ),
      update,
    },
  };
  const store: any = {
    getMinted: jest.fn().mockResolvedValue(null),
    setMinted: jest.fn(),
    isLocked: jest.fn().mockResolvedValue(false),
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn(),
  };
  const config: any = {
    get: (k: string) =>
      k === 'BASE_RELAYER_PRIVATE_KEY'
        ? opts.secret === null
          ? undefined
          : (opts.secret ?? '0x' + '11'.repeat(32))
        : undefined,
  };
  return {
    svc: new EvmRelayService(config, prisma, store),
    prisma,
    store,
    update,
  };
}

const iris = (msg: unknown) => {
  global.fetch = jest
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ messages: msg ? [msg] : [] }),
    }) as any;
};
const attested = (over: Parameters<typeof message>[0] = {}) =>
  iris({ status: 'complete', message: message(over), attestation: '0xdead' });

beforeEach(() => {
  receiveMessage.mockReset();
  usedNonces.mockReset().mockResolvedValue(0n);
});

describe('pure helpers', () => {
  it('recognises Stellar to Base and reads the network from the chain names', () => {
    expect(isStellarToBase('Stellar', 'Base')).toBe(true);
    expect(isStellarToBase('Stellar_Testnet', 'Base_Sepolia')).toBe(true);
    expect(isStellarToBase('Base', 'Stellar')).toBe(false);
    expect(isStellarToBase('Stellar', 'Ethereum')).toBe(false);
    expect(networkOf('Stellar_Testnet', 'Base_Sepolia')).toBe('testnet');
    expect(networkOf('Stellar', 'Base')).toBe('mainnet');
  });
  it('reads the destination caller out of the message header', () => {
    expect(destinationCallerOf(message())).toBe('0'.repeat(64));
    expect(destinationCallerOf(message({ caller: 'aa' }))).toMatch(/aa$/);
  });
});

describe('EvmRelayService', () => {
  it('mints on Base from the relayer and records it, delivering the transfer', async () => {
    attested();
    receiveMessage.mockResolvedValue({
      hash: '0xmint',
      wait: async () => ({ status: 1 }),
    });
    const { svc, update, store } = build();
    expect(
      await svc.relay(
        '0xcff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).toEqual({ status: 'complete', mintTxHash: '0xmint' });
    expect(receiveMessage).toHaveBeenCalledWith(
      expect.stringMatching(/^0x/),
      '0xdead',
    );
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: 'COMPLETED',
      metadata: {
        EVM_MINT_TX: '0xmint',
        DESTINATION_TX: '0xmint',
        EVM_MINTED_BY: 'relayer',
        SOURCE_TX: 'cff3',
      },
    });
    expect(store.releaseLock).toHaveBeenCalled();
  });

  it("refuses a burn that mints to anyone but the transfer's own destination", async () => {
    attested({ recipient: '0x1111111111111111111111111111111111111111' });
    const { svc } = build();
    await expect(
      svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(receiveMessage).not.toHaveBeenCalled();
  });

  it('refuses a burn that is not Stellar to Base', async () => {
    attested({ dest: 0 });
    await expect(
      build().svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a burn only a specific other caller may mint', async () => {
    attested({ caller: 'bb' });
    await expect(
      build().svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(receiveMessage).not.toHaveBeenCalled();
  });

  it("403s a burn that is not the caller's own transfer, and a caller we cannot identify", async () => {
    await expect(
      build({ transfer: null }).svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u2' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      build().svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('waits when Circle has not attested yet', async () => {
    iris({ status: 'pending_confirmations' });
    expect(
      await build().svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).toEqual({ status: 'pending' });
    global.fetch = jest.fn().mockRejectedValue(new Error('net')) as any;
    expect(
      await build().svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).toEqual({ status: 'pending' });
  });

  it("does not mint twice: already minted by the user's wallet counts as delivered", async () => {
    attested();
    usedNonces.mockResolvedValue(1n);
    const { svc, update } = build();
    expect(
      await svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).toEqual({ status: 'complete' });
    expect(receiveMessage).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data).toMatchObject({
      status: 'COMPLETED',
      metadata: { EVM_MINTED_BY: 'third-party' },
    });
  });

  it('returns the recorded mint without touching Circle or the chain', async () => {
    global.fetch = jest.fn() as any;
    const { svc } = build({
      transfer: transfer({ metadata: { EVM_MINT_TX: '0xold' } }),
    });
    expect(
      await svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).toEqual({ status: 'complete', mintTxHash: '0xold' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('says minting while another relay holds the lock', async () => {
    const { svc, store } = build();
    store.isLocked.mockResolvedValue(true);
    expect(
      await svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).toEqual({ status: 'minting' });
  });

  it('only relays Stellar to Base transfers, and needs a configured relayer', async () => {
    await expect(
      build({
        transfer: transfer({ fromChain: 'Base', toChain: 'Stellar' }),
      }).svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    attested();
    await expect(
      build({ secret: null }).svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).rejects.toThrow(/not configured/);
  });

  it('turns a reverted mint into a gateway error and releases the lock', async () => {
    attested();
    receiveMessage.mockResolvedValue({
      hash: '0xbad',
      wait: async () => ({ status: 0 }),
    });
    const { svc, store, update } = build();
    await expect(
      svc.relay(
        'cff39cec9dc6cf99451d9a3fb585fc06c278d52d6d3ea86d2744de51e44f7f61',
        { userId: 'u1' },
      ),
    ).rejects.toThrow(/reverted/);
    expect(store.releaseLock).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
