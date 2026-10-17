import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import GenderSheet from './GenderSheet.jsx';

const ROOM_ONLY = { male: 'male', female: 'female' };
const GROUP_ONLY = { men: 'male', women: 'female' };

export const restrictedGender = (item, kind) => (kind === 'group' ? GROUP_ONLY[item?.policy] : ROOM_ONLY[item?.gender]) || null;

/** Resolves `{ gender }` to send with the request, or `null` when the request must not go out. */
export function useGenderGate() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, update, refreshUser } = useAuth();
  const [pending, setPending] = useState(null);

  const askGender = useCallback(async (item, kind) => {
    const need = restrictedGender(item, kind);
    if (!need) return { gender: undefined };
    let own = user?.gender;
    if (!own) {
      own = await new Promise((resolve) => setPending({ need, kind, resolve }));
      if (!own) return null;
      try {
        await update({ gender: own });
      } catch (err) {
        const fresh = err.status === 409 ? await refreshUser() : null;
        if (!fresh?.gender) {
          toast(err.message, 'error');
          return null;
        }
        own = fresh.gender;
      }
    }
    if (own !== need) {
      toast(t('flatmates.genderMismatch', {
        kind: t(kind === 'group' ? 'flatmates.kindGroup' : 'flatmates.kindRoom'),
        who: t(need === 'female' ? 'flatmates.genderWomen' : 'flatmates.genderMen'),
      }), 'error');
      return null;
    }
    return { gender: own };
  }, [t, toast, user, update, refreshUser]);

  const settle = (gender) => { pending?.resolve(gender); setPending(null); };
  const genderSheet = pending
    ? <GenderSheet restrictedTo={pending.need} kind={pending.kind} onPick={settle} onCancel={() => settle(null)} />
    : null;

  return { askGender, genderSheet };
}
