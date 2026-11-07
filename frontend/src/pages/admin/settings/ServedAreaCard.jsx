import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Landmark, RefreshCw, Loader2, CheckCircle2, Search, X, Plus } from 'lucide-react';
import { getServedAreaReport, recheckServedArea } from '../../../services/localityService.js';
import { servedDistrictAreasOf, validBounds } from '../../../lib/geoConfig.js';
import { fetchSuggestions, fetchPlaceViewport, newAutocompleteSession } from '../../../lib/places.js';
import PoweredByGoogle from '../../../components/ui/PoweredByGoogle.jsx';
import DistrictMap from './DistrictMap.jsx';

const MAX_DISTRICTS = 40;
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const DISTRICT_SEARCH = { ignoreCityLimit: true, includedPrimaryTypes: ['administrative_area_level_3'], language: 'en' };

const toEntry = ({ name, placeId, bounds }) => ({
  name,
  ...(placeId ? { placeId } : {}),
  ...(validBounds(bounds) ? { bounds } : {}),
});

function DistrictSearch({ onPick, disabled }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const tokenRef = useRef(null);
  const reqRef = useRef(0);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) { setList([]); setLoading(false); return undefined; }
    setLoading(true);
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      if (!tokenRef.current) tokenRef.current = newAutocompleteSession();
      const res = await fetchSuggestions(term, tokenRef.current, DISTRICT_SEARCH);
      if (id !== reqRef.current) return;
      setList(res);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  const choose = async (s) => {
    setOpen(false);
    setLoading(true);
    const vp = await fetchPlaceViewport(s);
    tokenRef.current = null;
    setLoading(false);
    // Autocomplete labels it "Satara District", but places carry the bare "Satara" the server matches against.
    const name = s.mainText.replace(/\s+district$/i, '');
    if (await onPick({ name, placeId: s.placeId, bounds: vp?.bounds })) { setQ(''); setList([]); }
  };

  const showList = open && list.length > 0;
  const onKeyDown = (e) => {
    if (!list.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % list.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive((i) => (i <= 0 ? list.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && showList && active >= 0) { e.preventDefault(); void choose(list[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">Add a district</label>
      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-gray-500" aria-hidden="true" />
        <input
          id={`${listId}-input`}
          value={q}
          disabled={disabled}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Add a district, e.g. Satara"
          className="dz-input !pl-9 !pr-10 disabled:opacity-50"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute inset-y-0 right-3 my-auto h-4 w-4 animate-spin text-teal-400" aria-hidden="true" />}
      </div>
      {showList && (
        <div className="absolute inset-x-0 z-10 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-ink-2 shadow-2xl">
          <ul role="listbox" id={listId} aria-label="Districts">
            {list.map((s, i) => (
              <li
                key={s.placeId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={optionClass(i === active)}
                onMouseDown={(e) => { e.preventDefault(); void choose(s); }}
                onMouseEnter={() => setActive(i)}
              >
                <Plus className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-gray-100">{s.mainText}</span>
                  {s.secondaryText ? <span className="block truncate text-xs text-gray-500">{s.secondaryText}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end px-3 py-1.5"><PoweredByGoogle /></div>
        </div>
      )}
    </div>
  );
}

const optionClass = (active) => `flex min-h-11 cursor-pointer items-start gap-2 px-3 py-2 text-sm ${active ? 'bg-white/10' : ''}`;

export default function ServedAreaCard({ geo, onSave }) {
  const areas = servedDistrictAreasOf(geo);
  const names = areas.map((a) => a.name);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);

  useEffect(() => () => { latest.current = -1; }, []);

  const load = useCallback(async () => {
    const id = ++latest.current;
    try {
      const next = await getServedAreaReport();
      if (id !== latest.current) return;
      setReport(next);
      setError('');
    } catch {
      if (id === latest.current) setError('Could not load places outside the served districts. Reload to try again.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (next, message) => {
    const ok = await onSave({ ...geo, servedDistricts: next.map(toEntry) }, message);
    if (ok) await load();
    return ok;
  };

  const add = async (area) => {
    const name = String(area.name || '').trim();
    if (!name) return false;
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) {
      setError(`${name} is already served.`);
      return true;
    }
    const bounds = validBounds(area.bounds)
      ? { north: r5(area.bounds.north), south: r5(area.bounds.south), east: r5(area.bounds.east), west: r5(area.bounds.west) }
      : null;
    setError('');
    return save([...areas, { ...area, name, bounds }], `Now serving ${name}`);
  };

  const remove = (name) => save(areas.filter((a) => a.name !== name), `Stopped serving ${name}`);

  const recheck = async () => {
    setBusy(true);
    try {
      await recheckServedArea();
      await load();
    } catch {
      if (latest.current >= 0) setError('Check failed. Google may be unavailable; try again shortly.');
    } finally {
      if (latest.current >= 0) setBusy(false);
    }
  };

  const outside = report?.outside || [];
  const onlyOne = areas.length === 1;

  return (
    <section className="dz-card p-5" data-testid="served-area" aria-labelledby="served-area-title">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-brand-teal" aria-hidden="true" />
        <h3 id="served-area-title" className="text-sm font-bold text-white">
          Served districts <span className="font-medium text-gray-500">({areas.length})</span>
        </h3>
      </div>
      <p className="mt-1 text-xs text-gray-400">New localities and societies are accepted only inside these.</p>

      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Served districts">
        {areas.map((a) => (
          <li key={a.name} className="flex items-center gap-1 rounded-lg border border-brand-teal/40 bg-brand-teal/10 py-1 pl-3 pr-1 text-sm font-semibold text-brand-teal">
            {a.name}
            <button
              type="button"
              onClick={() => remove(a.name)}
              disabled={onlyOne}
              title={onlyOne ? 'At least one district must stay served' : undefined}
              aria-label={`Stop serving ${a.name}`}
              className="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-brand-teal/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <DistrictSearch onPick={add} disabled={areas.length >= MAX_DISTRICTS} />
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p> : null}

      <div className="mt-4">
        <DistrictMap areas={areas} />
      </div>

      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-gray-300">
            Listed places outside these districts
            {report ? (
              <span className="ml-1.5 text-gray-500">
                {report.outsideTotal > outside.length ? `(first ${outside.length} of ${report.outsideTotal})` : `(${outside.length})`}
              </span>
            ) : null}
          </h4>
          {report?.unchecked ? (
            <button type="button" onClick={recheck} disabled={busy} className="dz-btn dz-btn-ghost text-xs disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              Check {report.unchecked} older {report.unchecked === 1 ? 'place' : 'places'}
            </button>
          ) : null}
        </div>
        {report && !outside.length ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> None found.
          </p>
        ) : null}
        {outside.length ? (
          <ul className="mt-2 max-h-56 space-y-1.5 overflow-auto" aria-label="Places outside the served districts">
            {outside.map((r) => (
              <li key={`${r.kind}:${r.slug}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-gray-200">{r.name}</span>
                <span className="shrink-0 text-xs capitalize text-gray-500">{r.kind} · {r.district || 'no district'}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
