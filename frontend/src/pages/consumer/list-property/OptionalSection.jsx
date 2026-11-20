import { ChevronDown } from 'lucide-react';

export default function OptionalSection({ title, testId, children }) {
  return (
    <details className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] px-4 sm:px-5" data-testid={testId}>
      <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 py-3 text-sm font-semibold text-white">
        <span>{title}</span>
        <ChevronDown className="faq-chevron h-4 w-4 flex-shrink-0 text-gray-400 transition-transform" aria-hidden="true" />
      </summary>
      <div className="pb-2 pt-3">{children}</div>
    </details>
  );
}
