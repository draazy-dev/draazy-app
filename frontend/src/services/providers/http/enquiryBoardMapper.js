import { formatWhen } from '../../../lib/visitWhen.js';

const pad = (n) => String(n).padStart(2, '0');

function whenLabel(iso, mode) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dateIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const h = d.getHours();
  const time = `${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
  return formatWhen(dateIso, time, mode || '');
}

export function toEnquiry(dto) {
  if (!dto) return null;
  return {
    id: dto.id,
    propertyId: dto.propertyId ?? '',
    listing: dto.propertyTitle ?? '—',
    locality: dto.locality ?? '',
    customer: dto.requesterName ?? '—',
    mobile: dto.requesterMobile ?? '',
    status: dto.status ?? '',
    at: dto.createdAt ?? null,
  };
}

export function toVisit(dto) {
  if (!dto) return null;
  return {
    id: dto.id,
    propertyId: dto.propertyId ?? '',
    listing: dto.propertyTitle ?? '—',
    locality: dto.locality ?? '',
    customer: dto.visitorName ?? '—',
    mobile: dto.visitorMobile ?? '',
    slot: dto.slot ?? null,
    mode: dto.mode ?? '',
    when: whenLabel(dto.slot, dto.mode),
    status: dto.status ?? '',
    at: dto.createdAt ?? null,
  };
}

export function toDeal(dto) {
  if (!dto) return null;
  return {
    id: dto.id,
    propertyId: dto.propertyId ?? '',
    listing: dto.propertyTitle ?? '—',
    locality: dto.locality ?? '',
    deal: dto.deal ?? '',
    customer: dto.counterpartyName ?? '—',
    mobile: dto.counterpartyMobile ?? '',
    value: dto.agreedPrice ?? 0,
    status: dto.status ?? '',
    at: dto.closedAt ?? dto.createdAt ?? null,
    closedAt: dto.closedAt ?? null,
  };
}
