import { useStore } from '../store';

const KIND_STYLE: Record<string, string> = {
  info: 'border-gold-700 bg-ink-800 text-paper-100',
  error: 'border-seal-600 bg-ink-800 text-paper-100',
  alert: 'border-seal-600 bg-seal-600/90 text-paper-100 text-base font-bold',
};

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`w-full max-w-md rounded-md border px-3 py-2 text-sm shadow-lg ${KIND_STYLE[t.kind]}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
