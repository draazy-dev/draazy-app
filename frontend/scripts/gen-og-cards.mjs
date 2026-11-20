import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './vite-plugin-help-content.mjs';
import { TOPICS } from './vite-plugin-blog.mjs';
import { esc } from './seo-html.mjs';
import { ROUTE_HEADS } from '../src/data/routeHeads.js';
import { LANDING_PLACES, PUNE, TAGLINES, flatmateCopy, flatmatePath, landingCopy } from '../src/lib/landingPages.js';
import { LISTING_OG_TYPES, SITE_OG, flatmatesOg, landingOg, pageOg, routeOg } from '../src/lib/ogImages.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');
const MAX_BYTES = 60 * 1024;
const require = createRequire(join(root, 'package.json'));
const { chromium } = require(join(root, '../e2e/node_modules/playwright-core'));
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Icons = require('lucide-react');

const TEAL = '#0d9488';
const b64 = (file) => readFileSync(join(root, 'public', file)).toString('base64');
const fontFaces = [500, 800].map((w) => [
  [`outfit-${w}-1.woff2`, 'U+0100-02BA,U+20A0-20C0'],
  [`outfit-${w}-2.woff2`, 'U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2212'],
].map(([f, range]) => `@font-face{font-family:Outfit;font-weight:${w};src:url(data:font/woff2;base64,${b64(`fonts/${f}`)}) format('woff2');unicode-range:${range}}`).join('\n')).join('\n');

const CSS = `${fontFaces}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;position:relative;overflow:hidden;font-family:Outfit,sans-serif;color:#0f172a;
  background:radial-gradient(circle at 86% 40%,rgba(20,184,166,.20),transparent 46%),linear-gradient(135deg,#ffffff,#eef6f4)}
.bar{position:absolute;left:0;top:0;width:100%;height:10px;background:${TEAL}}
.brand{position:absolute;left:80px;top:62px;display:flex;align-items:center;gap:14px;font-size:36px;font-weight:800}
.brand svg{width:52px;height:52px}
.main{position:absolute;left:80px;top:140px;bottom:120px;width:700px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:22px}
.label{padding:9px 20px;border-radius:999px;background:rgba(13,148,136,.12);color:#0f766e;font-size:22px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.title{font-weight:800;line-height:1.08;text-wrap:balance}
.sub{font-size:29px;font-weight:500;line-height:1.3;color:#475569;text-wrap:pretty}
.foot{position:absolute;left:80px;bottom:56px;font-size:27px;font-weight:800;color:${TEAL}}
.foot span{color:#64748b;font-weight:500}
.tile{position:absolute;right:96px;top:150px;width:320px;height:320px;border-radius:76px;background:#fff;display:grid;place-items:center;
  box-shadow:0 34px 70px -24px rgba(15,118,110,.45),0 0 0 1px rgba(13,148,136,.14)}`;

const LOGO_PATHS = `<g transform="translate(-0.64 1.28) scale(0.96)"><path fill="${TEAL}" fill-rule="evenodd" d="M17 8 H32 A24 24 0 0 1 32 56 H17 A5 5 0 0 1 12 51 V13 A5 5 0 0 1 17 8 Z M17.5 12.5 H32 A19.5 19.5 0 0 1 32 51.5 H17.5 A1 1 0 0 1 16.5 50.5 V13.5 A1 1 0 0 1 17.5 12.5 Z"/><path fill="${TEAL}" stroke="${TEAL}" stroke-width="4" stroke-linejoin="round" d="M23.2 19.45 L30.7 23.17 V40.83 L23.2 44.55 Z"/></g>`;
const logo = (size) => `<svg viewBox="0 0 64 64" width="${size}" height="${size}">${LOGO_PATHS}</svg>`;
const icon = (name) => {
  if (name === 'logo') return logo(210);
  if (!Icons[name]) throw new Error(`[og] lucide-react has no icon ${name}`);
  return renderToStaticMarkup(createElement(Icons[name], { size: 172, color: TEAL, strokeWidth: 1.6 }));
};

const ROUTES = {
  '/listings': ['Search', 'Search', 'Flats, villas, plots and offices, direct from owners.'],
  '/societies': ['Societies', 'Building2', 'Amenities, RERA details and the homes listed in each.'],
  '/flatmates': ['Flatmates', 'Users', 'Find a room or a flatmate. Every post is moderated.'],
  '/list-property': ['For owners', 'HousePlus', 'Post your flat, plot or shop free. Tenants call you.'],
  '/services': ['Home services', 'Sparkles', 'Agreements, loans, legal help, movers and interiors.'],
  '/services/rent-agreement': ['Service', 'FilePenLine', 'Drafted and e-registered online, delivered to your inbox.'],
  '/services/property-legal': ['Service', 'Scale', 'Title checks, sale deeds and registration, done for you.'],
  '/services/property-valuation': ['Service', 'BadgeIndianRupee', 'A free instant estimate, then a certified report.'],
  '/services/packers-movers': ['Service', 'Truck', 'One all-inclusive quote from trusted movers.'],
  '/services/interior-renovation': ['Service', 'Sofa', 'Full interiors, modular kitchens and renovation.'],
  '/home-loans': ['Service', 'Landmark', 'We compare bank offers for your profile and call back.'],
  '/emi-calculator': ['Free tool', 'Calculator', 'Monthly EMI and total interest, in seconds.'],
  '/tools': ['Free tools', 'Wrench', 'Rent receipts, stamp duty, agreement cost and yield.'],
  '/tools/rent-receipt-generator': ['Free tool', 'Receipt', 'Monthly rent receipts for your HRA claim, as a PDF.'],
  '/tools/stamp-duty-calculator-maharashtra': ['Free tool', 'Stamp', 'Stamp duty and registration fee for a Pune flat.'],
  '/tools/rent-agreement-cost-pune': ['Free tool', 'HandCoins', 'What a Pune leave and licence agreement costs.'],
  '/tools/rental-yield-calculator': ['Free tool', 'TrendingUp', 'Gross and net yield, with the formulas shown.'],
  '/plans': ['Pricing', 'Tags', 'What Draazy costs for owners, buyers and tenants.'],
  '/compare/nobroker': ['Comparison', 'GitCompareArrows', 'Owner contacts, passes and fees, side by side.'],
  '/contact': ['Contact', 'Mail', "Ask about a home, a listing or a service. We'll reply."],
  '/about': ['About', 'logo', "Pune's broker-free property marketplace."],
  '/how-verification-works': ['Trust & safety', 'ShieldCheck', 'ID checks, reviewed listings and private numbers.'],
  '/privacy': ['Policy', 'Lock', 'How we collect, use and protect your data.'],
  '/terms': ['Policy', 'FileText', 'The terms for using Draazy and its services.'],
  '/refund-policy': ['Policy', 'Undo2', 'When and how Draazy refunds a payment.'],
  '/disclaimer': ['Policy', 'TriangleAlert', 'The limits of the information on Draazy.'],
};

const TYPE_ICONS = { flat: 'Building', house: 'House', villa: 'Building2', commercial: 'Briefcase', plot: 'Map', farmland: 'Trees' };
const NO_BROKERAGE = 'Listed by owners. ₹0 brokerage.';

const readPages = (dir, pick) => (existsSync(dir) ? readdirSync(dir) : [])
  .filter((f) => f.endsWith('.md'))
  .map((f) => ({ slug: f.slice(0, -3), data: parseFrontmatter(readFileSync(join(dir, f), 'utf-8')).data }))
  .map(pick)
  .filter(Boolean);

const routeCards = Object.entries(ROUTE_HEADS).filter(([path]) => path !== '/').map(([path, head]) => {
  if (!ROUTES[path]) throw new Error(`[og] ${path} is in ROUTE_HEADS but has no card copy in gen-og-cards.mjs`);
  const [label, iconName, sub] = ROUTES[path];
  return { path: routeOg(path), label, icon: iconName, sub, title: head.title.split(' | ')[0] };
});

const places = [PUNE, ...LANDING_PLACES];
const cards = [
  { path: SITE_OG, label: "Pune's broker-free marketplace", icon: 'logo', title: 'Broker-free homes in Pune', sub: 'Flats, offices and plots. Talk to owners directly. ₹0 brokerage.' },
  ...routeCards,
  ...['rent', 'buy'].flatMap((deal) => places.map((place) => ({
    path: landingOg(deal, place.slug),
    label: deal === 'rent' ? 'For rent' : 'For sale',
    icon: deal === 'rent' ? 'KeyRound' : 'House',
    title: landingCopy({ deal, place }).h1,
    sub: TAGLINES[place.slug] || NO_BROKERAGE,
  }))),
  ...[{ women: true, place: PUNE }, ...LANDING_PLACES.map((place) => ({ place }))].map((target) => ({
    path: flatmatesOg(flatmatePath(target).split('/').pop()),
    label: target.women ? 'Women-only flatmates' : 'Flatmates',
    icon: 'Users',
    title: flatmateCopy(target).h1,
    sub: 'Every post is moderated. No brokerage.',
  })),
  ...['rent', 'buy'].flatMap((deal) => LISTING_OG_TYPES.map((t) => ({
    path: `/og/listing/${deal}-${t.key}.jpg`,
    label: deal === 'rent' ? 'For rent' : 'For sale',
    icon: TYPE_ICONS[t.key],
    title: `${t.label} for ${deal === 'rent' ? 'rent' : 'sale'} in Pune`,
    sub: 'Listed by the owner. Talk to them directly. ₹0 brokerage.',
  }))),
  { path: pageOg('society'), label: 'Housing society', icon: 'Building2', title: 'A housing society in Pune', sub: 'Amenities, RERA details and the homes listed here.' },
  { path: pageOg('flatmates-room'), label: 'Room to share', icon: 'DoorOpen', title: 'A room is open in a shared flat', sub: 'Moderated post. Message the host on Draazy.' },
  { path: pageOg('flatmates-group'), label: 'Flat share', icon: 'Users', title: 'Flatmates wanted for a shared flat', sub: 'See the group and ask to join on Draazy.' },
  { path: pageOg('flatmates-post'), label: 'Looking for a flatmate', icon: 'UserSearch', title: 'Someone is looking for a flat share', sub: 'Have a room? Reply to their post on Draazy.' },
  { path: pageOg('signup'), label: 'Invite', icon: 'Gift', title: "You're invited to Draazy", sub: 'Rent or buy in Pune straight from owners. ₹0 brokerage.' },
  ...readPages(join(root, 'src/content/blog'), ({ slug, data }) => (data.draft === true ? null : {
    path: `/og/blog/${slug}.jpg`, label: TOPICS[data.topic] || 'Guide', icon: 'BookOpen', title: String(data.title),
  })),
  ...readPages(join(root, 'src/content/localities'), ({ slug, data }) => ({
    path: `/og/locality/${slug}.jpg`, label: 'Locality guide', icon: 'MapPin', title: String(data.title), sub: TAGLINES[slug],
  })),
];

const html = ({ label, title, sub, icon: iconName }) => {
  const size = title.length <= 30 ? 72 : title.length <= 48 ? 62 : 52;
  return `<!doctype html><style>${CSS}</style><body><div class="bar"></div>
<div class="brand">${logo(52)}Draazy</div>
<div class="main"><div class="label">${esc(label)}</div>
<div class="title" style="font-size:${size}px">${esc(title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
<div class="tile">${icon(iconName)}</div>
<div class="foot">draazy.com <span>· Pune, broker-free</span></div></body>`;
};

async function shoot(page, card) {
  await page.setContent(html(card));
  await page.evaluate(() => document.fonts.ready);
  for (const quality of [86, 78, 70, 60, 50]) {
    const jpeg = await page.screenshot({ type: 'jpeg', quality });
    if (jpeg.length <= MAX_BYTES) return jpeg;
  }
  throw new Error(`[og] ${card.title}: could not get the card under ${MAX_BYTES / 1024} KB`);
}

const seen = new Set();
for (const c of cards) {
  if (seen.has(c.path)) throw new Error(`[og] two cards share ${c.path}`);
  seen.add(c.path);
}

const ogDir = join(root, 'public/og');
mkdirSync(ogDir, { recursive: true });
for (const kind of readdirSync(ogDir)) {
  for (const f of readdirSync(join(ogDir, kind))) {
    if (f.endsWith('.jpg') && !seen.has(`/og/${kind}/${f}`)) { rmSync(join(ogDir, kind, f)); console.log(`removed og/${kind}/${f}`); }
  }
}

const todo = cards.filter((c) => force || !existsSync(join(root, 'public', c.path)));
if (todo.length) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    for (const card of todo) {
      const file = join(root, 'public', card.path);
      mkdirSync(dirname(file), { recursive: true });
      const jpeg = await shoot(page, card);
      writeFileSync(file, jpeg);
      console.log(`${card.path} ${(jpeg.length / 1024).toFixed(1)} KB`);
    }
  } finally {
    await browser.close();
  }
}
console.log(`og cards: ${todo.length} drawn of ${cards.length}`);
