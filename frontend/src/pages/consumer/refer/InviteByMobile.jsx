import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../../../components/Icon.jsx';
import MobileField from '../../../components/MobileField.jsx';
import { useMobileInput } from '../../../lib/hooks.js';
import { sendInvite } from '../../../services/referralService.js';

const ERROR_KEYS = {
  invalid_mobile: 'misc1.referErrInvalid',
  own_number: 'misc1.referErrOwn',
  invite_limit: 'misc1.referErrLimit',
};

function errorKey(err) {
  if (ERROR_KEYS[err?.code]) return ERROR_KEYS[err.code];
  if (err?.status === 429) return ERROR_KEYS.invite_limit;
  if (err?.status === 409) return 'misc1.referErrOff';
  return 'common.somethingWentWrong';
}

// The send awaits the server, so the browser may treat this as an unrequested popup and block it.
function openWhatsApp(url) {
  const win = window.open(url, '_blank');
  if (win) win.opener = null;
  return Boolean(win);
}

export default function InviteByMobile({ onSent }) {
  const { t } = useTranslation();
  const mobile = useMobileInput('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    if (!mobile.valid) { setStatus({ error: true, text: t('misc1.referErrInvalid') }); return; }
    setSending(true);
    setStatus(null);
    try {
      const res = await sendInvite(mobile.value);
      if (res.delivery === 'open_whatsapp') {
        setStatus(openWhatsApp(res.whatsappUrl)
          ? { text: t('misc1.referInviteOpening') }
          : { text: t('misc1.referInviteBlocked'), url: res.whatsappUrl });
      } else {
        setStatus({ text: t('misc1.referInviteSent', { mobile: mobile.value }) });
      }
      mobile.setValue('');
      onSent?.();
    } catch (err) {
      setStatus({ error: true, text: t(errorKey(err)) });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate data-testid="refer-invite-form">
      <label htmlFor="refer-friend-mobile" className="block text-sm font-semibold text-gray-200 mb-2">{t('misc1.referFriendMobile')}</label>
      <MobileField
        id="refer-friend-mobile"
        enterKeyHint="send"
        value={mobile.value}
        onChange={(v) => { mobile.setValue(v); setStatus(null); }}
        error={status?.error === true}
        aria-invalid={status?.error === true}
        disabled={sending}
        placeholder={t('misc1.referFriendMobilePh')}
        aria-describedby="refer-invite-status"
      />
      <button
        type="submit"
        disabled={sending}
        data-testid="refer-invite-send"
        className="btn-teal w-full mt-3 px-4 py-3 min-h-[44px] rounded-xl font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <Icon name="message-circle" className="w-4 h-4" /> {sending ? t('misc1.referInviteSending') : t('misc1.referInviteSend')}
      </button>
      <p
        id="refer-invite-status"
        role="status"
        data-testid="refer-invite-status"
        className={`text-sm mt-2 min-h-[1.25rem] ${status?.error ? 'text-red-400' : 'text-emerald-300'}`}
      >
        {status?.text}
      </p>
      {status?.url && (
        <a
          href={status.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="refer-invite-open"
          className="btn-outline mt-2 w-full min-h-[44px] rounded-xl font-semibold inline-flex items-center justify-center gap-2 text-gray-200"
        >
          <Icon name="message-circle" className="w-4 h-4" /> {t('misc1.referInviteOpen')}
        </a>
      )}
    </form>
  );
}
