import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { posts } from 'virtual:blog-index';
import Icon from '../../../components/Icon.jsx';
import { GUIDE_LOCALITIES } from '../../../lib/guideLocalities.js';
import { TopicIcon } from '../blog/BlogParts.jsx';

const card = 'min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5';

function CardHead({ icon, title, to, all }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-400/10 text-teal-300">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <h2 className="min-w-0 flex-1 text-base font-bold text-white">{title}</h2>
      <Link to={to} className="tap-extend relative inline-flex items-center gap-0.5 text-xs font-semibold text-brand-teal-3 hover:text-brand-teal-2">
        {all}
        <Icon name="chevron-right" aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export default function ExploreStrips() {
  const { t } = useTranslation();
  return (
    <section className="max-w-7xl mx-auto grid gap-3 px-4 py-6 sm:gap-6 sm:px-6 sm:py-12 lg:grid-cols-2 lg:px-8">
      <div className={card}>
        <CardHead icon="map-pin" title={t('home.explore.localities')} to="/locality" all={t('home.explore.allLocalities')} />
        <div className="flex flex-wrap gap-2">
          {Object.entries(GUIDE_LOCALITIES).map(([slug, name]) => (
            <Link key={slug} to={`/locality/${slug}`} className="dz-chip">{name}</Link>
          ))}
        </div>
      </div>
      <div className={card}>
        <CardHead icon="book-open" title={t('home.explore.blog')} to="/blog" all={t('home.explore.allPosts')} />
        <ul className="-mx-2">
          {posts.slice(0, 3).map((post) => (
            <li key={post.slug}>
              <Link to={`/blog/${post.slug}`} className="group flex min-h-[56px] items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
                <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5">
                  <TopicIcon topic={post.topic} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium leading-snug text-slate-100 group-hover:text-white">{post.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{post.topicLabel}</span>
                </span>
                <Icon name="chevron-right" aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
