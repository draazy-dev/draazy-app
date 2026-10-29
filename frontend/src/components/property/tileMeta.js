import { AMEN_LBL } from '../../pages/consumer/listings/constants.js';

export const POSSESSION = { ready: 'Ready to move', under: 'Under constr.', new: 'New launch' };

export const AMEN_ICON = { gym: 'dumbbell', pool: 'waves', lift: 'move-vertical', parking: 'parking-circle', security: 'shield-check', power: 'zap', garden: 'trees', club: 'users', play: 'party-popper' };
const AMEN_EXTRA = { play: 'Play Area' };
export const amenLabel = (k) => AMEN_LBL[k] ?? AMEN_EXTRA[k] ?? k;
