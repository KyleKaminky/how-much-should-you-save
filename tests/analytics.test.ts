import { describe, expect, it } from 'vitest';
import { stripQuery } from '../src/lib/analytics';
import { DEFAULT_INPUTS } from '../src/lib/defaults';
import { encodeInputs } from '../src/lib/urlState';
import type { Inputs } from '../src/lib/types';

/**
 * Vercel Web Analytics records query parameters by default, and this app puts
 * every input in the query string. Without redaction, each visitor's salary and
 * balance would be shipped to a third party. These tests are the guard.
 */
describe('analytics redaction', () => {
  it('removes the query string', () => {
    const out = stripQuery({ url: 'https://example.com/?age=32&inc=210000&sav=185000' });
    expect(out.url).toBe('https://example.com/');
  });

  it('removes the hash too', () => {
    const out = stripQuery({ url: 'https://example.com/?inc=500000#results' });
    expect(out.url).toBe('https://example.com/');
  });

  it('leaves a clean URL untouched', () => {
    const out = stripQuery({ url: 'https://example.com/' });
    expect(out.url).toBe('https://example.com/');
  });

  it('preserves the path', () => {
    const out = stripQuery({ url: 'https://example.com/some/path?inc=210000' });
    expect(out.url).toBe('https://example.com/some/path');
  });

  it('preserves other event fields', () => {
    const out = stripQuery({ url: 'https://example.com/?inc=1', referrer: 'https://x.com' });
    expect(out.referrer).toBe('https://x.com');
  });

  it('blanks an unparseable URL rather than passing it through', () => {
    // Better to lose the event than to forward something still carrying a query.
    expect(stripQuery({ url: 'not a url ?inc=210000' }).url).toBe('');
  });

  it('leaks no input parameter for any scenario the app can produce', () => {
    // Build a URL from a fully-populated scenario and assert that none of the
    // encoded keys or values survive redaction.
    const scenario: Inputs = {
      ...DEFAULT_INPUTS,
      currentAge: 32,
      retirementAge: 58,
      planToAge: 97,
      income: 210_000,
      currentSavings: 185_000,
      employerMatch: 0.045,
      replacementRatio: 0.65,
      inflation: 0.025,
      wageGrowth: 0.035,
      returnModel: 'glidePath',
      withdrawalRateOverride: 0.037,
      savingsRateOverride: 0.185,
      socialSecurity: { enabled: true, claimAge: 70, haircut: 0.35, piaOverride: 3125 },
    };

    const qs = encodeInputs(scenario);
    expect(qs.length).toBeGreaterThan(0);

    const redacted = stripQuery({ url: `https://example.com/?${qs}` }).url;
    expect(redacted).toBe('https://example.com/');

    // No key and no value from the scenario may appear anywhere in the result.
    for (const pair of qs.split('&')) {
      const [key, value] = pair.split('=');
      expect(redacted, `key ${key} leaked`).not.toContain(key);
      if (value) expect(redacted, `value ${value} leaked`).not.toContain(value);
    }
    // The distinctive figures specifically.
    for (const secret of ['210000', '185000', '3125', '32', '0.65']) {
      expect(redacted).not.toContain(secret);
    }
  });

  it('redacts parameters that do not exist yet', () => {
    // Stripping wholesale rather than by name means a future input is covered
    // automatically instead of quietly becoming the next leak.
    const out = stripQuery({ url: 'https://example.com/?some_future_field=sensitive' });
    expect(out.url).toBe('https://example.com/');
    expect(out.url).not.toContain('sensitive');
  });
});
