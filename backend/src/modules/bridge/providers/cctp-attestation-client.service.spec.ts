import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { CctpAttestationClient } from './cctp-attestation-client.service';

describe('CctpAttestationClient', () => {
  let client: CctpAttestationClient;
  let httpService: { get: jest.Mock };

  async function build(configOverrides: Record<string, string | undefined> = {}) {
    httpService = { get: jest.fn() };
    const config: Record<string, string | undefined> = { STELLAR_NETWORK: 'testnet', ...configOverrides };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CctpAttestationClient,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => config[key]) } },
      ],
    }).compile();

    return module.get<CctpAttestationClient>(CctpAttestationClient);
  }

  beforeEach(async () => {
    client = await build();
  });

  it('returns the attestation once complete', async () => {
    httpService.get.mockReturnValue(
      of({ data: { messages: [{ status: 'complete', message: '0xdead', attestation: '0xbeef' }] } }),
    );

    const result = await client.getAttestation('0xburnhash', 6);

    expect(result).toEqual({ message: '0xdead', attestation: '0xbeef', status: 'complete' });
    // The source domain (6 = Base) is a required PATH segment on Circle's
    // v2 API, not just a query param — GET /v2/messages/{domain} — an
    // earlier version omitted it entirely and 404'd on every real call.
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringMatching(/iris-api-sandbox\.circle\.com\/v2\/messages\/6$/),
      expect.objectContaining({ params: { transactionHash: '0xburnhash' } }),
    );
  });

  it('uses the mainnet Iris host when STELLAR_NETWORK is mainnet', async () => {
    const mainnetClient = await build({ STELLAR_NETWORK: 'mainnet' });
    httpService.get.mockReturnValue(of({ data: { messages: [] } }));

    await mainnetClient.getAttestation('0xhash', 6);

    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('iris-api.circle.com'),
      expect.anything(),
    );
  });

  it('returns null while still pending confirmations', async () => {
    httpService.get.mockReturnValue(
      of({ data: { messages: [{ status: 'pending_confirmations', attestation: 'PENDING' }] } }),
    );
    await expect(client.getAttestation('0xhash', 6)).resolves.toBeNull();
  });

  it('returns null when no message is indexed yet (404)', async () => {
    const err = new AxiosError('Not found');
    (err as any).response = { status: 404 };
    httpService.get.mockReturnValue(throwError(() => err));

    await expect(client.getAttestation('0xhash', 6)).resolves.toBeNull();
  });

  it('returns null (not throw) on an unexpected error', async () => {
    httpService.get.mockReturnValue(throwError(() => new Error('network blip')));
    await expect(client.getAttestation('0xhash', 6)).resolves.toBeNull();
  });
});
