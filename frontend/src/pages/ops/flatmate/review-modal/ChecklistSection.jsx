import { ListChecks } from 'lucide-react';
import { Block } from '../board.jsx';

export default function ChecklistSection({ items, busy, onTick }) {
  const done = items.filter((c) => c.pass).length;
  return (
    <Block icon={ListChecks} title="Before publishing" aside={<span className="text-xs tabular-nums text-gray-400">{done}/{items.length}</span>} className="flatmate-checklist-section">
      <ul className="space-y-1.5" data-testid="flatmate-checklist">
        {items.map((c) => (
          <li key={c.item}>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-gray-200">
              <input
                type="checkbox"
                data-testid="flatmate-checklist-item"
                checked={c.pass}
                disabled={busy}
                onChange={(e) => onTick(c.item, e.target.checked)}
                className="h-5 w-5 shrink-0 accent-teal-500"
              />
              <span className="min-w-0">{c.item}</span>
            </label>
          </li>
        ))}
      </ul>
    </Block>
  );
}
