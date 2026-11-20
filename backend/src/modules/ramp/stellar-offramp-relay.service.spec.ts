import { payoutOrdersOver } from './testing/payout-orders-double';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StellarOfframpRelayService } from './stellar-offramp-relay.service';

const receiveMessage = jest.fn();
const usedNonces = jest.fn();
jest.mock('ethers', () => ({
  Wallet: jest.fn().mockImplementation(() => ({})),
  JsonRpcProvider: jest.fn().mockImplementation(() => ({})),
  Contract: jest
    .fn()
    .mockImplementation(() => ({ receiveMessage, usedNonces })),
}));

const RECIPIENT = '0x' + '11'.repeat(20);
const makeMessage = (
  over: { src?: number; dst?: number; recipient?: string } = {},
) => {
  const header = Buffer.alloc(148);
  header.writeUInt32BE(over.src ?? 27, 4);
  header.writeUInt32BE(over.dst ?? 6, 8);
  Buffer.from('ab'.repeat(32), 'hex').copy(header, 12);
  const body = Buffer.alloc(228);
  Buffer.from((over.recipient ?? RECIPIENT).slice(2), 'hex').copy(body, 48);
  return '0x' + Buffer.concat([header, body]).toString('hex');
};

function build(
  env: Record<string, string> = {
    BASE_RELAYER_PRIVATE_KEY: '0x' + '1'.repeat(64),
    STELLAR_OFFRAMP_NETWORK: 'mainnet',
  },
) {
  const config: any = { get: (k: string) => env[k] };
  const prisma: any = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    offrampProviderOrder: { findUnique: jest.fn() },
    offrampTransaction: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  return { svc: new StellarOfframpRelayService(config, prisma, payoutOrdersOver(prisma)), prisma };
}

const orderRow = { id: 'p1', offrampTransactionId: 't1' };
const tx = (meta: any) => ({ id: 't1', userId: 'u1', metadata: meta });
const relayMeta = (over: any = {}) => ({
  cctpRelay: { status: 'awaiting_burn', mintRecipient: RECIPIENT },
  stellarTxHash: 'a'.repeat(64),
  ...over,
});

function mockIris(status: 'complete' | 'pending', message = makeMessage()) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      messages: [{ status, message, attestation: '0xatt' }],
    }),
  });
}

describe('StellarOfframpRelayService', () => {
  beforeEach(() => {
    receiveMessage.mockReset();
    usedNonces.mockReset();
    usedNonces.mockResolvedValue(0n);
  });

  describe('relay()', () => {
    it("404s when the order isn't the caller's", async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(null);
      await expect(svc.relay('off_1', 'u2')).rejects.toThrow(NotFoundException);
    });

    it('rejects orders that are not relayed', async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx({}));
      await expect(svc.relay('off_1', 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('waits for the burn to be confirmed', async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(
        tx({ cctpRelay: { mintRecipient: RECIPIENT } }),
      );
      expect((await svc.relay('off_1', 'u1')).state).toBe('awaiting_burn');
    });

    it("waits while Circle's attestation is pending", async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx(relayMeta()));
      mockIris('pending');
      expect((await svc.relay('off_1', 'u1')).state).toBe('attesting');
      expect(receiveMessage).not.toHaveBeenCalled();
    });

    it('mints on Base once the attestation is ready and records the hash', async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx(relayMeta()));
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        metadata: relayMeta(),
      });
      mockIris('complete');
      receiveMessage.mockResolvedValue({
        hash: '0xmint',
        wait: jest.fn().mockResolvedValue({ status: 1 }),
      });

      const res = await svc.relay('off_1', 'u1');

      expect(receiveMessage).toHaveBeenCalledTimes(1);
      expect(receiveMessage).toHaveBeenCalledWith(makeMessage(), '0xatt');
      expect(res).toMatchObject({ state: 'minted', mintTxHash: '0xmint' });
      expect(prisma.offrampTransaction.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: {
            metadata: expect.objectContaining({
              cctpRelay: expect.objectContaining({
                status: 'minted',
                mintTxHash: '0xmint',
              }),
            }),
          },
        }),
      );
    });

    it('refuses to mint a burn that does not target this order (wrong recipient)', async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx(relayMeta()));
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        metadata: relayMeta(),
      });
      mockIris('complete', makeMessage({ recipient: '0x' + '22'.repeat(20) }));
      await expect(svc.relay('off_1', 'u1')).rejects.toThrow('does not match');
      expect(receiveMessage).not.toHaveBeenCalled();
    });

    it('refuses a burn on the wrong source/destination domain', async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx(relayMeta()));
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        metadata: relayMeta(),
      });
      mockIris('complete', makeMessage({ dst: 0 }));
      await expect(svc.relay('off_1', 'u1')).rejects.toThrow('does not match');
      expect(receiveMessage).not.toHaveBeenCalled();
    });

    it('does not mint twice when another caller holds the claim', async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx(relayMeta()));
      mockIris('complete');
      prisma.$executeRaw.mockResolvedValueOnce(0);
      expect((await svc.relay('off_1', 'u1')).state).toBe('minting');
      expect(receiveMessage).not.toHaveBeenCalled();
    });

    it('treats an already-used nonce as delivered without sending a transaction', async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx(relayMeta()));
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        metadata: relayMeta(),
      });
      mockIris('complete');
      usedNonces.mockResolvedValue(1n);
      expect((await svc.relay('off_1', 'u1')).state).toBe('minted');
      expect(receiveMessage).not.toHaveBeenCalled();
    });

    it('is a no-op once minted', async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(
        tx(
          relayMeta({
            cctpRelay: {
              status: 'minted',
              mintRecipient: RECIPIENT,
              mintTxHash: '0xdone',
            },
          }),
        ),
      );
      (global as any).fetch = jest.fn();
      const res = await svc.relay('off_1', 'u1');
      expect(res).toMatchObject({ state: 'minted', mintTxHash: '0xdone' });
      expect((global as any).fetch).not.toHaveBeenCalled();
    });

    it('reports an out-of-gas relayer as unavailable and frees the claim for a retry', async () => {
      const { svc, prisma } = build();
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx(relayMeta()));
      prisma.offrampTransaction.findUnique.mockResolvedValue({
        metadata: relayMeta(),
      });
      mockIris('complete');
      receiveMessage.mockRejectedValue(
        new Error('insufficient funds for gas * price + value'),
      );
      await expect(svc.relay('off_1', 'u1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2); // claim + release
    });

    it('fails closed when no relayer key is configured', async () => {
      const { svc, prisma } = build({});
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx(relayMeta()));
      await expect(svc.relay('off_1', 'u1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('planBurn()', () => {
    it("uses Circle's quoted fast fee", async () => {
      const { svc } = build();
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { finalityThreshold: 1000, minimumFee: 1.3 },
          { finalityThreshold: 2000, minimumFee: 0 },
        ],
      });
      const plan = await svc.planBurn('100');
      expect(plan.feeBps).toBeCloseTo(1.8);
      expect(Number(plan.burnAmount)).toBeGreaterThan(100);
    });

    it('falls back to a conservative fee when Circle is unreachable', async () => {
      const { svc } = build();
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('network'));
      expect((await svc.planBurn('100')).feeBps).toBeCloseTo(2.5);
    });
  });

  describe('network selection', () => {
    const svcFor = (env: Record<string, string>) => build(env).svc;

    it('defaults to mainnet, even though CCTP_NETWORK defaults to testnet', () => {
      expect(svcFor({}).defaultNetwork()).toBe('mainnet');
      expect(svcFor({ CCTP_NETWORK: 'testnet' }).defaultNetwork()).toBe('mainnet');
    });

    it('default is testnet only when STELLAR_OFFRAMP_NETWORK says so', () => {
      expect(svcFor({ STELLAR_OFFRAMP_NETWORK: 'testnet' }).defaultNetwork()).toBe('testnet');
    });

    it("follows the client's toggle, falling back to the default", () => {
      const svc = svcFor({});
      expect(svc.resolveNetwork('testnet')).toBe('testnet');
      expect(svc.resolveNetwork('mainnet')).toBe('mainnet');
      expect(svc.resolveNetwork(undefined)).toBe('mainnet');
      expect(svc.resolveNetwork('nonsense')).toBe('mainnet');
      expect(svcFor({ STELLAR_OFFRAMP_NETWORK: 'testnet' }).resolveNetwork(undefined)).toBe('testnet');
    });

    it('relays a testnet order against the Circle sandbox and the testnet transmitter', async () => {
      const { svc, prisma } = build();
      const meta = relayMeta({ cctpRelay: { status: 'awaiting_burn', mintRecipient: RECIPIENT, network: 'testnet' } });
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx(meta));
      prisma.offrampTransaction.findUnique.mockResolvedValue({ metadata: meta });
      mockIris('complete');
      receiveMessage.mockResolvedValue({ hash: '0xmint', wait: jest.fn().mockResolvedValue({ status: 1 }) });

      await svc.relay('off_1', 'u1');

      expect(((global as any).fetch as jest.Mock).mock.calls[0][0]).toContain('iris-api-sandbox.circle.com');
      const { Contract } = jest.requireMock('ethers');
      expect(Contract.mock.calls.at(-1)[0]).toBe('0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275');
    });

    it('relays a mainnet order against live Circle and the mainnet transmitter', async () => {
      const { svc, prisma } = build();
      const meta = relayMeta({ cctpRelay: { status: 'awaiting_burn', mintRecipient: RECIPIENT, network: 'mainnet' } });
      prisma.offrampProviderOrder.findUnique.mockResolvedValue(orderRow);
      prisma.offrampTransaction.findFirst.mockResolvedValue(tx(meta));
      prisma.offrampTransaction.findUnique.mockResolvedValue({ metadata: meta });
      mockIris('complete');
      receiveMessage.mockResolvedValue({ hash: '0xmint', wait: jest.fn().mockResolvedValue({ status: 1 }) });

      await svc.relay('off_1', 'u1');

      expect(((global as any).fetch as jest.Mock).mock.calls[0][0]).toContain('https://iris-api.circle.com');
      const { Contract } = jest.requireMock('ethers');
      expect(Contract.mock.calls.at(-1)[0]).toBe('0x81D40F21F12A8F0E3252Bccb954D722d4c464B64');
    });
  });
});
