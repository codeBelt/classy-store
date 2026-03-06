export function FooterLink({href, label}: {href: string; label: string}) {
  return (
    <p className="text-center text-[11px] text-(--color-text-muted) tracking-wide">
      Powered by{' '}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-(--color-accent) hover:text-(--color-accent-hover) transition-colors duration-150"
      >
        {label}
      </a>
    </p>
  );
}
