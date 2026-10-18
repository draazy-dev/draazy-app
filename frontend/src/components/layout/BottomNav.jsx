import { Link, useLocation } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import { usePostChooser, usePostChooserOpen } from '../../context/PostChooserContext.jsx';
/* Mobile bottom tab bar (below lg), the primary wayfinding surface on phones. */

const SLOTS = ['/reels', '/listings', null, '/flatmates', '/services'];
const POST_SLOT = 2;
/* Long enough for most of the 520ms slide, short enough that the tap still feels answered. */
const POST_OPEN_DELAY_MS = 420;

function Tab({ to, icon, label, active, current }) {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      /* Explicit name so the visible label can be dropped in landscape, where vertical space is scarce, without
         leaving the tab unnamed. */
      aria-label={label}
      className={
        'dz-bottom-nav__tab relative flex flex-1 flex-col items-center justify-center gap-0.5 min-w-[52px]' +
        (active ? ' is-active' : '')
      }
    >
      <span className="dz-bottom-nav__icon">
        <Icon name={icon} className="w-[22px] h-[22px]" weight={active ? 'fill' : 'regular'} />
      </span>
      <span className={'dz-bottom-nav__label ' + (active ? 'font-semibold' : 'font-medium')}>{label}</span>
    </Link>
  );
}

export default function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { openPostChooser } = usePostChooser();
  const postChooserOpen = usePostChooserOpen();
  const [postPending, setPostPending] = useState(false);
  const postTimer = useRef(0);
  useEffect(() => () => clearTimeout(postTimer.current), []);

  const path = pathname.toLowerCase();
  const activeIndex = SLOTS.findIndex((p) => p && path.startsWith(p));
  const postSelected = postPending || postChooserOpen;
  const selected = postSelected ? POST_SLOT : activeIndex;
  /* The notch closes in place on routes owning no slot, so the next tab slides it from there rather than from 0. */
  const [notchIndex, setNotchIndex] = useState(selected >= 0 ? selected : POST_SLOT);
  if (selected >= 0 && selected !== notchIndex) setNotchIndex(selected);
  const postLabel = t('chrome.postPropertyFree');
  /* Search is a plain link to /listings from everywhere, Home included — /listings already IS the search surface, and
     a tab that opens a modal on one route makes the bar unpredictable. */

  /* The chooser's backdrop covers the bar, so opening on the tap would hide the slide; let it land first. */
  const onPost = () => {
    if (postPending) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      openPostChooser();
      return;
    }
    setPostPending(true);
    postTimer.current = setTimeout(() => {
      openPostChooser();
      setPostPending(false);
    }, POST_OPEN_DELAY_MS);
  };

  return (
    <nav
      aria-label={t('nav.primaryMobile', 'Primary')}
      className={'dz-bottom-nav lg:hidden' + (selected >= 0 ? ' has-active' : '')}
      style={{ '--dz-nav-i': notchIndex }}
      data-kbd-hide
    >
      <span aria-hidden="true" className="dz-bottom-nav__bg" />
      {/* Active state is a raised filled bubble, not just a colour shift — WCAG 1.4.1. */}
      <span aria-hidden="true" className="dz-bottom-nav__bubble" />
      <Tab to="/reels" icon="video" label={t('nav.reels', 'Reels')} active={selected === 0} current={activeIndex === 0} />
      <Tab to="/listings" icon="search" label={t('nav.search', 'Search')} active={selected === 1} current={activeIndex === 1} />
      {/* Centre slot — the ONLY posting control below 1024px (`.sf-post-cta` is the exact complement). */}
      <button
        type="button"
        onClick={onPost}
        aria-label={postLabel}
        title={postLabel}
        /* This control stays on screen while what it opened is open, so it has to say so — or a screen-reader user
           who dismisses with Escape lands on a button still announcing a dialog. */
        aria-haspopup="dialog"
        aria-expanded={postChooserOpen}
        className={
          'dz-bottom-nav__tab relative flex flex-1 flex-col items-center justify-center gap-0.5 min-w-[52px]' +
          (postSelected ? ' is-active' : '')
        }
      >
        <span className="dz-bottom-nav__icon">
          <Icon name="plus-circle" className="w-[22px] h-[22px]" weight={postSelected ? 'fill' : 'regular'} />
        </span>
        <span className={'dz-bottom-nav__label ' + (postSelected ? 'font-semibold' : 'font-medium')}>
          {t('nav.post', 'Post')}
        </span>
      </button>
      {/* Both tabs avoid glyphs spoken for elsewhere: `users` is the occupants chip on property cards and `sparkles`
         is the AI-search mark, so a tab wearing it reads as "AI". */}
      <Tab to="/flatmates" icon="users-round" label={t('nav.flatmates', 'Flatmates')} active={selected === 3} current={activeIndex === 3} />
      <Tab to="/services" icon="toolbox" label={t('nav.services', 'Services')} active={selected === 4} current={activeIndex === 4} />
    </nav>
  );
}
