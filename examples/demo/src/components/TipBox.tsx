import type {ReactNode} from 'react';

type TipVariant = 'tip' | 'warning' | 'info' | 'when-to-use';

const variantConfig: Record<
  TipVariant,
  {border: string; icon: string; label: string; labelColor: string}
> = {
  tip: {
    border: 'border-emerald-500/40',
    icon: '\u{1F4A1}',
    label: 'Tip',
    labelColor: 'text-emerald-400',
  },
  warning: {
    border: 'border-amber-500/40',
    icon: '\u26A0\uFE0F',
    label: 'Warning',
    labelColor: 'text-amber-400',
  },
  info: {
    border: 'border-blue-500/40',
    icon: '\u2139\uFE0F',
    label: 'Info',
    labelColor: 'text-blue-400',
  },
  'when-to-use': {
    border: 'border-violet-500/40',
    icon: '\u{1F3AF}',
    label: 'When to use',
    labelColor: 'text-violet-400',
  },
};

export function TipBox({
  variant = 'tip',
  children,
}: {
  variant?: TipVariant;
  children: ReactNode;
}) {
  const config = variantConfig[variant];

  return (
    <div
      className={`border-l-2 ${config.border} bg-zinc-800/30 rounded-r-lg px-4 py-3`}
    >
      <div className={`text-xs font-semibold ${config.labelColor} mb-1`}>
        {config.icon} {config.label}
      </div>
      <div className="text-sm text-zinc-300">{children}</div>
    </div>
  );
}
