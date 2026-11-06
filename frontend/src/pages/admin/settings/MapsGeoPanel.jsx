import { useState, useEffect, useRef, useId } from 'react';
import { Globe, MapPin, Ban, Trash2, Search, Loader2, Type } from 'lucide-react';
import { classNames } from '../../../lib/format.js';
import { fetchAdminSuggestions, newAutocompleteSession } from '../../../lib/places.js';
import Switch from '../../../components/ui/Switch.jsx';
import PoweredByGoogle from '../../../components/ui/PoweredByGoogle.jsx';
import ServedAreaCard from './ServedAreaCard.jsx';

function BlacklistSearch({ onPickPlace, onAddTerm }) {
  const [q, setQ] = useState('');
  const [suggs, setSuggs] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const listId = useId();
  const tokenRef = useRef(null);
  const boxRef = useRef(null);
  const reqRef = useRef(0);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) { setSuggs([]); setLoading(false); return undefined; }
    setLoading(true);
    const id = ++reqRef.current;
    const t = setTimeout(async () => {
      if (!tokenRef.current) tokenRef.current = newAutocompleteSession();
      const list = await fetchAdminSuggestions(term, tokenRef.current);
      if (id !== reqRef.current) return;
      setSuggs(list);
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const options = term.length < 2 ? [] : [...suggs.map((s) => ({ place: s })), { term }];
  const showList = open && options.length > 0;

  const done = () => {
    tokenRef.current = null;
    setQ(''); setSuggs([]); setOpen(false); setActive(-1);
  };
  const choose = (opt) => {
    if (opt.place) onPickPlace({ placeId: opt.place.placeId, term: opt.place.mainText, note: opt.place.secondaryText || '' });
    else onAddTerm(opt.term);
    done();
  };

  const onKeyDown = (e) => {
    if (!options.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive((i) => (i <= 0 ? options.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && showList && active >= 0) { e.preventDefault(); choose(options[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <label htmlFor={`${listId}-input`} className="mb-1 block text-xs font-medium text-gray-400">Hide a place</label>
      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-gray-500" aria-hidden="true" />
        <input
          id={`${listId}-input`}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a locality, society or name"
          className="dz-input !pl-9 !pr-10"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute inset-y-0 right-3 my-auto h-4 w-4 animate-spin text-teal-400" aria-hidden="true" />}
      </div>
      {showList && (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <ul role="listbox" id={listId}>
            {options.map((opt, i) => (
              <li
                key={opt.place ? opt.place.placeId : 'term'}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={classNames('flex min-h-11 cursor-pointer items-start gap-2 px-3 py-2 text-sm', i === active && 'bg-white/10', !opt.place && i > 0 && 'border-t border-white/10')}
                onMouseDown={(e) => { e.preventDefault(); choose(opt); }}
                onMouseEnter={() => setActive(i)}
              >
                {opt.place
                  ? <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" aria-hidden="true" />
                  : <Type className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="block truncate text-gray-100">
                    {opt.place ? opt.place.mainText : <>Hide every name containing &ldquo;{opt.term}&rdquo;</>}
                  </span>
                  <span className="block truncate text-xs text-gray-500">
                    {opt.place ? opt.place.secondaryText : 'Broad: also hides places that only include it'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {suggs.some((s) => s._p) && <div className="flex justify-end px-3 py-1.5"><PoweredByGoogle /></div>}
        </div>
      )}
    </div>
  );
}

export default function MapsGeoPanel({ geo = {}, onSave }) {
  const enforce = geo.enforceCityLimit !== false;
  const blacklist = Array.isArray(geo.blacklist) ? geo.blacklist : [];

  const toggleEnforce = () => onSave({ ...geo, enforceCityLimit: !enforce }, `Search limit ${!enforce ? 'enabled' : 'disabled'}`);

  const addBlacklist = (entry) => {
    onSave({ ...geo, blacklist: [{ id: 'bl' + Date.now().toString(36), at: Date.now(), ...entry }, ...blacklist] }, `Blacklisted "${entry.term}"`);
  };

  const addBlacklistTerm = (t) => {
    if (t.length < 2 || blacklist.some((b) => !b.placeId && b.term.toLowerCase() === t.toLowerCase())) return;
    addBlacklist({ term: t, note: '' });
  };

  const addBlacklistPlace = ({ placeId, term, note }) => {
    if (!placeId || blacklist.some((b) => b.placeId === placeId)) return;
    addBlacklist({ placeId, term, note });
  };

  const removeBlacklist = (id) => {
    const term = blacklist.find((b) => b.id === id)?.term || id;
    onSave({ ...geo, blacklist: blacklist.filter((b) => b.id !== id) }, `Removed blacklist "${term}"`);
  };

  return (
    <div className="space-y-5">
      <ServedAreaCard geo={geo} onSave={onSave} />

      <section className="dz-card p-5" aria-labelledby="maps-limit-title">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-brand-teal" aria-hidden="true" />
              <h3 id="maps-limit-title" className="text-sm font-bold text-white">Keep search inside served districts</h3>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              On: shopper search suggests only places in the districts above. Off: they just rank first.
            </p>
          </div>
          <Switch checked={enforce} onChange={toggleEnforce} label="Keep search inside served districts" />
        </div>
      </section>

      <section className="dz-card p-5" aria-labelledby="maps-blacklist-title">
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-rose-400" aria-hidden="true" />
          <h3 id="maps-blacklist-title" className="text-sm font-bold text-white">
            Blacklisted places
            {blacklist.length ? <span className="ml-1.5 font-medium text-gray-500">({blacklist.length})</span> : null}
          </h3>
        </div>
        <p className="mt-1 mb-4 text-xs text-gray-400">Hidden from every search box in the app.</p>

        <BlacklistSearch onPickPlace={addBlacklistPlace} onAddTerm={addBlacklistTerm} />

        {blacklist.length === 0 ? (
          <p className="mt-4 text-xs text-gray-500">Nothing hidden yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {blacklist.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{b.term}</span>
                    <span className={classNames('rounded px-1.5 py-0.5 text-[11px] font-semibold', b.placeId ? 'bg-brand-teal/10 text-brand-teal' : 'bg-white/5 text-gray-400')}>
                      {b.placeId ? 'Exact place' : 'Name contains'}
                    </span>
                  </div>
                  {b.note ? <p className="mt-0.5 truncate text-xs text-gray-500">{b.note}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => removeBlacklist(b.id)}
                  className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-gray-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                  aria-label={`Remove ${b.term}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
