import assert from 'node:assert/strict';
import { scrub, uaFamily } from './errorScrub.js';

assert.equal(scrub('failed for jane.doe+x@mail.example.com now'), 'failed for [email] now');
assert.equal(scrub('call +91 98765 43210 or 9876543210 or 919876543210'), 'call [number] or [number] or [number]');
assert.equal(scrub('aadhaar 1234 5678 9012 pan ABCDE1234F'), 'aadhaar [id] pan [pan]');
assert.equal(scrub('Authorization: Bearer abc.def'), 'Authorization: Bearer [token]');
assert.equal(scrub('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl end'), 'jwt [token] end');
assert.equal(scrub(`key ${'a1b2'.repeat(10)} end`), 'key [token] end');
assert.equal(scrub('GET https://x.example/listings?q=jane&mobile=1#frag failed'), 'GET https://x.example/listings?[redacted] failed');
assert.equal(scrub('at Foo (https://x.example/assets/Foo-abc12345.js:10:5)'), 'at Foo (https://x.example/assets/Foo-abc12345.js:10:5)');
assert.equal(scrub('ab '.repeat(2000)).length, 1000);
assert.equal(scrub('a'.repeat(5000) + '@b.com').includes('@'), false);
assert.equal(scrub(undefined), '');
assert.equal(scrub(scrub('mail a@b.co')), scrub('mail a@b.co'));

const chromeAndroid = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
assert.equal(uaFamily(chromeAndroid), 'Chrome 141 / Android');
assert.equal(uaFamily(`${chromeAndroid} Edg/140.0.1`), 'Edge 140 / Android');
assert.equal(uaFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1'), 'Safari 17 / iOS');
assert.equal(uaFamily(''), 'Other / Other');
