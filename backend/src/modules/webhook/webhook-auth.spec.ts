import { UnauthorizedException } from '@nestjs/common';
import { WebhookController } from './webhook.controller';

/**
 * SafeHaven / Blockradar / Flint webhooks are not signed and trigger money movement, so each
 * endpoint must authenticate the caller BEFORE touching the database or the queue.
 */
describe('WebhookController authentication of unsigned provider webhooks', () => {
  const build = (env: Record<string, string | undefined>) => {
    const queue = { enqueue: jest.fn(), add: jest.fn() };
    const prisma = {
      inboundWebhook: {
        create: jest.fn().mockResolvedValue({ id: 'w1' }),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const config = { get: jest.fn((k: string) => env[k]) };
    const ctl = new WebhookController(
      queue as any,
      prisma as any,
      config as any,
    );
    return { ctl, prisma, queue };
  };
  const forged = {
    event: 'account.credit',
    data: { amount: 5000, creditAccountNumber: '0123456789' },
  };

  const endpoints: [
    string,
    string,
    (c: WebhookController, t?: string, q?: string) => Promise<any>,
  ][] = [
    [
      'Blockradar /webhook/blockradar',
      'BLOCKRADAR_WEBHOOK_TOKEN',
      (c, t, q) => c.handleBlockRadarWebhook(forged, t, q),
    ],
    [
      'Flint /webhook/ramp',
      'FLINT_WEBHOOK_TOKEN',
      (c, t, q) => c.handleRampWebhook(forged, t, q),
    ],
  ];

  describe.each(endpoints)('%s', (_name, tokenEnv, call) => {
    it('rejects a forged event with no token, and stores/enqueues nothing', async () => {
      const { ctl, prisma, queue } = build({
        NODE_ENV: 'production',
        [tokenEnv]: 'a-long-random-shared-token',
      });
      await expect(call(ctl)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.inboundWebhook.create).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('rejects a wrong token (header or query)', async () => {
      const { ctl, prisma } = build({
        NODE_ENV: 'production',
        [tokenEnv]: 'a-long-random-shared-token',
      });
      await expect(call(ctl, 'guess')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(call(ctl, undefined, 'guess')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.inboundWebhook.create).not.toHaveBeenCalled();
    });

    it('accepts the right token from the x-webhook-token header or from ?token=', async () => {
      const a = build({
        NODE_ENV: 'production',
        [tokenEnv]: 'a-long-random-shared-token',
      });
      await expect(
        call(a.ctl, 'a-long-random-shared-token'),
      ).resolves.toMatchObject({ status: 'accepted' });
      const b = build({
        NODE_ENV: 'production',
        [tokenEnv]: 'a-long-random-shared-token',
      });
      await expect(
        call(b.ctl, undefined, 'a-long-random-shared-token'),
      ).resolves.toMatchObject({ status: 'accepted' });
    });

    it('fails closed in production when no token is configured', async () => {
      const { ctl, prisma } = build({ NODE_ENV: 'production' });
      await expect(call(ctl)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.inboundWebhook.create).not.toHaveBeenCalled();
    });

    it('still works unconfigured outside production (local development)', async () => {
      const { ctl } = build({ NODE_ENV: 'development' });
      await expect(call(ctl)).resolves.toMatchObject({ status: 'accepted' });
    });

    it('has an explicit rollout escape hatch, which never overrides a configured token', async () => {
      const open = build({
        NODE_ENV: 'production',
        WEBHOOK_ALLOW_UNAUTHENTICATED: 'true',
      });
      await expect(call(open.ctl)).resolves.toMatchObject({
        status: 'accepted',
      });
      const strict = build({
        NODE_ENV: 'production',
        WEBHOOK_ALLOW_UNAUTHENTICATED: 'true',
        [tokenEnv]: 'a-long-random-shared-token',
      });
      await expect(call(strict.ctl)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  it("one provider's token does not authenticate another provider's endpoint", async () => {
    const env = {
      NODE_ENV: 'production',
      BLOCKRADAR_WEBHOOK_TOKEN: 'blockradar-token-aaaaaaaa',
      FLINT_WEBHOOK_TOKEN: 'flint-token-bbbbbbbbbbb',
    };
    const { ctl } = build(env);
    await expect(
      ctl.handleRampWebhook(forged, 'blockradar-token-aaaaaaaa'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('SafeHaven /webhook/sh (cannot send a token, so it is not token-protected)', () => {
    it('accepts events in production without any token, and does not break on token configuration', async () => {
      const bare = build({ NODE_ENV: 'production' });
      await expect(bare.ctl.handleMFBWebhook(forged)).resolves.toMatchObject({
        status: 'accepted',
      });
      expect(bare.prisma.inboundWebhook.create).toHaveBeenCalled();

      const withOthers = build({
        NODE_ENV: 'production',
        BLOCKRADAR_WEBHOOK_TOKEN: 'blockradar-token-aaaaaaaa',
        FLINT_WEBHOOK_TOKEN: 'flint-token-bbbbbbbbbbb',
      });
      await expect(
        withOthers.ctl.handleMFBWebhook(forged),
      ).resolves.toMatchObject({ status: 'accepted' });
    });

    it('does not read a SAFEHAVEN_WEBHOOK_TOKEN setting any more', async () => {
      const { ctl } = build({
        NODE_ENV: 'production',
        SAFEHAVEN_WEBHOOK_TOKEN: 'a-token-nobody-can-send-aaaa',
      });
      await expect(ctl.handleMFBWebhook(forged)).resolves.toMatchObject({
        status: 'accepted',
      });
    });
  });
});
