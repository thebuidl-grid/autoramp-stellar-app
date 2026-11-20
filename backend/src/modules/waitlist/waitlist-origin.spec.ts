import { normalizeReferrer } from './dto/join-waitlist.dto';
import { visitorCountry } from './waitlist.controller';

describe('visitorCountry', () => {
  const req = (headers: Record<string, string | string[]>) =>
    ({ headers }) as any;

  it('prefers the proxy-forwarded country, falling back to Cloudflare', () => {
    expect(
      visitorCountry(req({ 'x-visitor-country': 'gh', 'cf-ipcountry': 'NG' })),
    ).toBe('GH');
    expect(visitorCountry(req({ 'cf-ipcountry': 'ke' }))).toBe('KE');
  });

  it('returns null when missing or not a real country code', () => {
    expect(visitorCountry(req({}))).toBeNull();
    expect(visitorCountry(req({ 'x-visitor-country': 'XX' }))).toBeNull(); // unknown
    expect(visitorCountry(req({ 'x-visitor-country': 'T1' }))).toBeNull(); // Tor
    expect(visitorCountry(req({ 'x-visitor-country': 'NGA' }))).toBeNull();
    expect(visitorCountry(req({ 'x-visitor-country': '<script>' }))).toBeNull();
  });

  it('handles an array header value', () => {
    expect(visitorCountry(req({ 'x-visitor-country': ['ng', 'gh'] }))).toBe(
      'NG',
    );
  });
});

describe('normalizeReferrer', () => {
  it.each([
    ['https://www.Twitter.com/some/path?x=1', 'twitter.com'],
    ['twitter.com', 'twitter.com'],
    ['  HTTP://News.Example.org  ', 'news.example.org'],
    ['t.co', 't.co'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeReferrer(input)).toBe(expected);
  });

  it('turns blank into undefined and leaves non-strings alone', () => {
    expect(normalizeReferrer('   ')).toBeUndefined();
    expect(normalizeReferrer(undefined)).toBeUndefined();
    expect(normalizeReferrer(5)).toBe(5);
  });
});
