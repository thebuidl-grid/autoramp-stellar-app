import { generateTrxReference } from './reference.util';

describe('generateTrxReference', () => {
  it('has the expected shape and length', () => {
    expect(generateTrxReference(16, 'off')).toMatch(/^off_[A-Za-z0-9]{16}$/);
    expect(generateTrxReference()).toMatch(/^txn_[A-Za-z0-9]{16}$/);
    expect(generateTrxReference(8)).toMatch(/^txn_[A-Za-z0-9]{8}$/);
  });

  it('does not use Math.random (references must be unpredictable)', () => {
    const random = jest.spyOn(Math, 'random');
    for (let i = 0; i < 200; i++) generateTrxReference();
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('does not repeat', () => {
    const seen = new Set(
      Array.from({ length: 5000 }, () => generateTrxReference()),
    );
    expect(seen.size).toBe(5000);
  });
});
