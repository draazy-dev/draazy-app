// `GET /fees` (public): one breakdown per deal intent. Money is whole rupees; `null` means "not published", never zero.
import { createProvider } from './config.js';

const provider = createProvider('fees');

// Public, so it renders for signed-out visitors: no token, no session short-circuit.
export const listFees = async () => (await provider()).listFees();

// `null` when nothing is published for the deal, so callers render a pending state instead of a made-up zero row.
export const getDealFees = async (deal) => {
  const rows = await listFees();
  return (Array.isArray(rows) ? rows : []).find((f) => f.deal === deal) || null;
};
