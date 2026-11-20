import { MiscController, normalizeBitnobBank } from './misc.controller';

describe('normalizeBitnobBank', () => {
  it('exposes bankCode, code and name from Bitnob field names', () => {
    expect(
      normalizeBitnobBank({ bank_code: '000013', bank_name: 'GTBank' }),
    ).toMatchObject({ bankCode: '000013', code: '000013', name: 'GTBank' });
    expect(normalizeBitnobBank({ code: 'GH1', name: 'Ecobank' })).toMatchObject(
      {
        bankCode: 'GH1',
        name: 'Ecobank',
      },
    );
  });
});

describe('MiscController.getBankList', () => {
  const build = (banks: any[]) => {
    const bitnob = { listBanks: jest.fn().mockResolvedValue(banks) };
    const ramp = { getBanks: jest.fn().mockResolvedValue({ legacy: true }) };
    return {
      bitnob,
      ramp,
      controller: new MiscController(ramp as any, bitnob as any),
    };
  };

  it('serves NG from Bitnob (default country)', async () => {
    const { controller, bitnob, ramp } = build([{ code: '1', name: 'A' }]);
    const res: any = await controller.getBankList(undefined);
    expect(bitnob.listBanks).toHaveBeenCalledWith('NG');
    expect(ramp.getBanks).not.toHaveBeenCalled();
    expect(res.data[0].bankCode).toBe('1');
  });

  it('falls back to the legacy list for NG when Bitnob is empty', async () => {
    const { controller } = build([]);
    await expect(controller.getBankList('NG')).resolves.toEqual({
      legacy: true,
    });
  });

  it('returns an empty list for KE when Bitnob is empty, no legacy fallback', async () => {
    const { controller, ramp } = build([]);
    await expect(controller.getBankList('KE')).resolves.toEqual({
      status: 'success',
      data: [],
    });
    expect(ramp.getBanks).not.toHaveBeenCalled();
  });
});
