import { describe, expect, it } from 'vitest';
import { FREE_TOOLS, SOURCES as TOOL_SOURCES, TOOLS_AS_OF, TOOLS_HUB, toolByPath } from '../../../src/data/freeTools.js';
import {
  AS_OF, CHECKED_ON, COMPARE_NOBROKER, CORRECTIONS_EMAIL, SOURCES as NOBROKER_SOURCES,
} from '../../../src/data/compareNobroker.js';
import { ROUTE_HEADS, SITE_DESCRIPTION } from '../../../src/data/routeHeads.js';
import { TRUST_PAGES } from '../../../src/data/trustPages.js';
import { ASSISTANT, ESCALATION, KB, QUICK_ACTIONS, ROUTE_SUGGESTIONS } from '../../../src/data/assistant.js';

const filled = (v) => typeof v === 'string' && v.trim() !== '';
const isInternalPath = (p) => typeof p === 'string' && /^\/(?!\/)/.test(p);

describe('freeTools', () => {
  it('finds a tool by its path', () => {
    const [first] = FREE_TOOLS;
    expect(toolByPath(first.path)).toBe(first);
    expect(toolByPath('/tools/unknown')).toBeUndefined();
    expect(toolByPath(undefined)).toBeUndefined();
  });

  it('gives every tool a unique tools path and the copy a page needs', () => {
    const paths = FREE_TOOLS.map((t) => t.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const tool of FREE_TOOLS) {
      expect(tool.path.startsWith('/tools/'), tool.path).toBe(true);
      for (const field of ['name', 'summary', 'top', 'accent', 'subtitle']) expect(filled(tool[field]), `${tool.path} ${field}`).toBe(true);
      expect(tool.how.length, tool.path).toBeGreaterThan(0);
      expect(tool.faq.length, tool.path).toBeGreaterThan(0);
      for (const { q, a } of tool.faq) { expect(filled(q)).toBe(true); expect(filled(a)).toBe(true); }
      expect(isInternalPath(tool.cta.to.split('?')[0]), tool.path).toBe(true);
    }
  });

  it('cites only sources that exist, or explains why there are none', () => {
    for (const tool of FREE_TOOLS) {
      (tool.sources || []).forEach((key) => expect(TOOL_SOURCES, `${tool.path} -> ${key}`).toHaveProperty(key));
      if (!tool.sources?.length) expect(filled(tool.noSources), tool.path).toBe(true);
    }
  });

  it('serves https source links with labels', () => {
    for (const [key, src] of Object.entries(TOOL_SOURCES)) {
      expect(filled(src.label), key).toBe(true);
      expect(src.url.startsWith('https://'), key).toBe(true);
    }
    expect(filled(TOOLS_AS_OF)).toBe(true);
    expect(TOOLS_HUB.path).toBe('/tools');
  });
});

describe('compareNobroker', () => {
  const collect = (node, out = []) => {
    if (Array.isArray(node)) node.forEach((n) => collect(n, out));
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'src') out.push(...v);
        else collect(v, out);
      }
    }
    return out;
  };

  it('cites only listed NoBroker sources', () => {
    const cited = collect(COMPARE_NOBROKER);
    expect(cited.length).toBeGreaterThan(0);
    cited.forEach((key) => expect(NOBROKER_SOURCES).toHaveProperty(key));
    for (const src of Object.values(NOBROKER_SOURCES)) expect(src.url.startsWith('https://www.nobroker.in')).toBe(true);
  });

  it('compares every row on both sides with internal links for Draazy', () => {
    for (const row of COMPARE_NOBROKER.rows) {
      expect(filled(row.label)).toBe(true);
      expect(filled(row.nobroker.text), row.label).toBe(true);
      expect(filled(row.draazy.text), row.label).toBe(true);
      if (row.draazy.link) expect(isInternalPath(row.draazy.link[1]), row.label).toBe(true);
    }
  });

  it('threads the freshness date and corrections address into the faq', () => {
    const source = COMPARE_NOBROKER.faq.find((f) => f.a.includes(CORRECTIONS_EMAIL));
    expect(source.a).toContain(AS_OF);
    expect(filled(CHECKED_ON)).toBe(true);
    expect(CORRECTIONS_EMAIL).toMatch(/^[^@\s]+@[^@\s]+$/);
    COMPARE_NOBROKER.faq.forEach(({ q, a }) => { expect(filled(q)).toBe(true); expect(filled(a)).toBe(true); });
    expect(COMPARE_NOBROKER.nobrokerFit.list.length).toBeGreaterThan(0);
    COMPARE_NOBROKER.draazyFit.links.forEach(([, to]) => expect(isInternalPath(to)).toBe(true));
  });
});

describe('routeHeads', () => {
  it('gives every route a title and a description, and the home page the site description', () => {
    expect(ROUTE_HEADS['/'].description).toBe(SITE_DESCRIPTION);
    for (const [route, head] of Object.entries(ROUTE_HEADS)) {
      expect(isInternalPath(route), route).toBe(true);
      expect(filled(head.title), route).toBe(true);
      expect(filled(head.description), route).toBe(true);
    }
  });
});

describe('trustPages', () => {
  it('builds every page from titled sections with content', () => {
    expect(TRUST_PAGES['/about'].intro).toBe(SITE_DESCRIPTION);
    for (const [route, page] of Object.entries(TRUST_PAGES)) {
      expect(isInternalPath(route), route).toBe(true);
      expect(filled(page.top), route).toBe(true);
      expect(page.sections.length, route).toBeGreaterThan(0);
      for (const section of page.sections) {
        expect(filled(section.title), route).toBe(true);
        expect(Boolean(section.body?.length || section.list?.length), `${route}: ${section.title}`).toBe(true);
        (section.links || []).forEach(([label, to]) => { expect(filled(label)).toBe(true); expect(filled(to)).toBe(true); });
      }
    }
  });
});

describe('assistant knowledge base', () => {
  const ids = KB.map((e) => e.id);

  it('has unique entries with keywords, a question and an answer', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of KB) {
      expect(entry.keywords.length, entry.id).toBeGreaterThan(0);
      entry.keywords.forEach((k) => expect(k, entry.id).toBe(k.toLowerCase()));
      expect(filled(entry.q), entry.id).toBe(true);
      expect(filled(entry.a), entry.id).toBe(true);
    }
  });

  it('gives every action a label and either a destination or a follow-up question', () => {
    for (const entry of KB) {
      for (const action of entry.actions || []) {
        expect(filled(action.label), entry.id).toBe(true);
        expect(Boolean(action.to || action.ask), `${entry.id}: ${action.label}`).toBe(true);
      }
    }
  });

  it('only suggests entries that exist, for routes that exist', () => {
    for (const [route, suggested] of Object.entries(ROUTE_SUGGESTIONS)) {
      expect(isInternalPath(route), route).toBe(true);
      suggested.forEach((id) => expect(ids, `${route} -> ${id}`).toContain(id));
    }
    for (const entry of KB) (entry.pages || []).forEach((p) => expect(isInternalPath(p), entry.id).toBe(true));
  });

  it('offers quick actions that navigate or ask', () => {
    for (const action of QUICK_ACTIONS) {
      expect(['nav', 'ask']).toContain(action.kind);
      expect(filled(action.kind === 'nav' ? action.to : action.text), action.label).toBe(true);
    }
  });

  it('hands over to a human through chat, contact and phone', () => {
    expect(ESCALATION.actions).toHaveLength(3);
    expect(ESCALATION.actions.map((a) => a.icon)).toEqual(['message-square', 'mail', 'phone']);
    expect(ESCALATION.actions[2].external).toBe(true);
    expect(ESCALATION.actions[2].label.startsWith('Call ')).toBe(true);
    expect(ASSISTANT.greeting).toContain(ASSISTANT.name);
  });
});
