// Canned API for the PR Lighthouse run, so home, listings and the detail page render with data.
// Fixtures were captured from sandbox with the owner anonymised and photos pointed at same-origin /og images.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.MOCK_API_PORT || 8080);
const fixture = (name) => readFileSync(new URL(`fixtures/${name}.json`, import.meta.url));

const ROUTES = [
  [/^\/api\/bootstrap$/, 'bootstrap'],
  [/^\/api\/faqs$/, 'faqs'],
  [/^\/api\/societies\/top$/, 'societies-top'],
  [/^\/api\/properties\/featured$/, 'properties-featured'],
  [/^\/api\/properties$/, 'properties'],
  [/^\/api\/properties\/[^/]+$/, 'property'],
];

createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const hit = req.method === 'GET' && ROUTES.find(([re]) => re.test(path));
  if (hit) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(fixture(hit[1]));
    return;
  }
  if (req.method !== 'GET') {
    res.writeHead(204);
    res.end();
    return;
  }
  // Printed so a new call the pages start making shows up in the job log as a fixture to add.
  console.log(`mock-api: no fixture for GET ${req.url}`);
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end('{}');
}).listen(PORT, '127.0.0.1', () => console.log(`mock-api on 127.0.0.1:${PORT}`));
