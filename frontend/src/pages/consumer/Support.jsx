import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import Icon from '../../components/Icon.jsx';
import { useScrollReveal } from '../../lib/useScrollReveal.js';
import { supportLink } from '../../lib/supportLink.js';
import { listFaqs } from '../../services/contentService.js';
import FaqSection from './support/FaqSection.jsx';
import ContactCard from './support/ContactCard.jsx';

function legacyRedirect(params) {
  const open = params.get('open');
  if (open) return supportLink('ticket', open);
  const invoice = (params.get('invoice') || '').replace(/[^\w-]/g, '').slice(0, 40);
  return invoice ? supportLink('invoice', invoice) : null;
}

function LinkCard({ to, icon, title, body, testId, accent }) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className={`reveal flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors hover:border-teal-400/40 ${accent ? 'border-teal-400/30 bg-teal-400/[0.06]' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-400/10">
        <Icon name={icon} className="w-4 h-4 text-teal-400" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-xs text-gray-500">{body}</span>
      </span>
      <Icon name="arrow-right" className="w-4 h-4 shrink-0 text-gray-500" />
    </Link>
  );
}

export default function Support() {
  const { t: tr } = useTranslation();
  const rootRef = useScrollReveal();
  const [params] = useSearchParams();
  const [faqs, setFaqs] = useState([]);
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    let alive = true;
    listFaqs().then((f) => alive && setFaqs(f));
    return () => { alive = false; };
  }, []);

  const redirect = legacyRedirect(params);
  if (redirect) return <Navigate to={redirect} replace />;

  return (
    <div ref={rootRef}>
      <div className="pt-8 lg:pt-10 pb-20 min-h-[100dvh]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8 reveal">
            <div className="dz-tag mb-3 bg-teal-500/10 border border-teal-500/20">
              <Icon name="life-buoy" className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-xs text-teal-300 font-semibold">{tr('misc.supportBadge')}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white">
              {tr('misc.supportHelpPre')}<span className="gradient-text">{tr('misc.supportSupportWord')}</span>
            </h1>
            <p className="text-gray-400 text-sm mt-2 max-w-2xl">{tr('misc.supportSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6">
            <div className="space-y-3">
              <LinkCard
                to={supportLink('general')}
                icon="message-square"
                title={tr('misc.supportChatTitle')}
                body={tr('misc.supportChatBody')}
                testId="support-chat-cta"
                accent
              />
              <LinkCard to="/help" icon="book-open" title={tr('help.deflectTitle')} body={tr('help.deflectBody')} />
            </div>
            <ContactCard />
          </div>
        </div>
      </div>

      <FaqSection faqs={faqs} openFaq={openFaq} setOpenFaq={setOpenFaq} />
    </div>
  );
}