import { describe, expect, it } from 'vitest';
import { scrub, uaFamily } from '../../../src/lib/errorScrub.js';

describe('scrub', () => {
  it('redacts emails, phone numbers and government ids', () => {
    expect(scrub('failed for jane.doe+x@mail.example.com now')).toBe('failed for [email] now');
    expect(scrub('call +91 98765 43210 or 9876543210 or 919876543210')).toBe('call [number] or [number] or [number]');
    expect(scrub('aadhaar 1234 5678 9012 pan ABCDE1234F')).toBe('aadhaar [id] pan [pan]');
  });

  it('redacts tokens and bearer credentials', () => {
    expect(scrub('Authorization: Bearer abc.def')).toBe('Authorization: Bearer [token]');
    expect(scrub('jwt eyJhbGciOi.eyJzdWIiOi.c2ln end')).toBe('jwt [token] end');
    expect(scrub(`key ${'a1b2'.repeat(10)} end`)).toBe('key [token] end');
  });

  it('redacts query strings and fragments but keeps asset paths', () => {
    expect(scrub('GET https://x.example/listings?q=jane&mobile=1#frag failed')).toBe('GET https://x.example/listings?[redacted] failed');
    expect(scrub('at Foo (https://x.example/assets/Foo-abc12345.js:10:5)')).toBe('at Foo (https://x.example/assets/Foo-abc12345.js:10:5)');
  });

  it('truncates, tolerates non-strings and is idempotent', () => {
    expect(scrub('ab '.repeat(2000)).length).toBe(1000);
    expect(scrub('ab '.repeat(200), 50).length).toBe(50);
    expect(scrub('a'.repeat(5000) + '@b.com').includes('@')).toBe(false);
    expect(scrub(undefined)).toBe('');
    expect(scrub(42)).toBe('');
    expect(scrub(scrub('mail a@b.co'))).toBe(scrub('mail a@b.co'));
  });
});

describe('uaFamily', () => {
  const chromeAndroid = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

  it('names the browser major version and the system', () => {
    expect(uaFamily(chromeAndroid)).toBe('Chrome 141 / Android');
    expect(uaFamily(`${chromeAndroid} Edg/140.0.1`)).toBe('Edge 140 / Android');
    expect(uaFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1')).toBe('Safari 17 / iOS');
    expect(uaFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('Firefox 130 / Windows');
    expect(uaFamily('Mozilla/5.0 (Macintosh) AppleWebKit Chrome/120.0 OPR/105.0')).toBe('Opera 105 / macOS');
    expect(uaFamily('Mozilla/5.0 (Linux; Android 13) SamsungBrowser/23.0 Chrome/115.0')).toBe('Samsung Internet 23 / Android');
    expect(uaFamily('X11; Linux x86_64')).toBe('Other / Linux');
  });

  it('falls back to Other for empty input', () => {
    expect(uaFamily('')).toBe('Other / Other');
    expect(uaFamily()).toBe('Other / Other');
  });
});
