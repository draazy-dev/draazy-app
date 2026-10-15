import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../../context/ToastContext.jsx';
import * as flatmateService from '../../../services/flatmateService.js';
import GenderSheet from './GenderSheet.jsx';

const ROOM_ONLY = { male: 'male', female: 'female' };
const GROUP_ONLY = { men: 'male', women: 'female' };

export const restrictedGender = (item, kind) => (kind === 'group' ? GROUP_ONLY[item?.policy] : ROOM_ONLY[item?.gender]) || null;

async function ownPostGender() {
  try {
    const page = await flatmateService.myFlatmatePosts({ size: 1 });
    const gender = page.items?.[0]?.gender;
    return gender === 'male' || gender === 'female' ? gender : null;
  } catch {
    return null;
  }
}

/** Resolves `{ gender }` to send with the request, or `null` when the request must not go out. */
export function useGenderGate() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pending, setPending] = useState(null);

  const askGender = useCallback(async (item, kind) => {
    const need = restrictedGender(item, kind);
    if (!need) return { gender: undefined };
    const own = await ownPostGender() || await new Promise((resolve) => setPending({ need, kind, resolve }));
    if (!own) return null;
    if (own !== need) {
      toast(t('flatmates.genderMismatch', {
        kind: t(kind === 'group' ? 'flatmates.kindGroup' : 'flatmates.kindRoom'),
        who: t(need === 'female' ? 'flatmates.genderWomen' : 'flatmates.genderMen'),
      }), 'error');
      return null;
    }
    return { gender: own };
  }, [t, toast]);

  const settle = (gender) => { pending?.resolve(gender); setPending(null); };
  const genderSheet = pending
    ? <GenderSheet restrictedTo={pending.need} kind={pending.kind} onPick={settle} onCancel={() => settle(null)} />
    : null;

  return { askGender, genderSheet };
}
