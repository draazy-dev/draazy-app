import { Link, useLocation } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon.jsx';
import { usePostChooser, usePostChooserOpen } from '../../context/PostChooserContext.jsx';

const SLOTS = ['/reels', '/listings', null, '/flatmates', '/services'];
const POST_SLOT = 2;
const POST_OPEN_DELAY_MS = 420;

function Tab({ to, icon, label, active, current }) {
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
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
  const [notchIndex, setNotchIndex] = useState(selected >= 0 ? selected : POST_SLOT);
  if (selected >= 0 && selected !== notchIndex) setNotchIndex(selected);
  const postLabel = t('chrome.postPropertyFree');

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
      <span aria-hidden="true" className="dz-bottom-nav__bubble" />
      <Tab to="/reels" icon="video" label={t('nav.reels', 'Reels')} active={selected === 0} current={activeIndex === 0} />
      <Tab to="/listings" icon="search" label={t('nav.search', 'Search')} active={selected === 1} current={activeIndex === 1} />
      <button
        type="button"
        onClick={onPost}
        aria-label={postLabel}
        title={postLabel}
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
      <Tab to="/flatmates" icon="users-round" label={t('nav.flatmates', 'Flatmates')} active={selected === 3} current={activeIndex === 3} />
      <Tab to="/services" icon="toolbox" label={t('nav.services', 'Services')} active={selected === 4} current={activeIndex === 4} />
    </nav>
  );
}
