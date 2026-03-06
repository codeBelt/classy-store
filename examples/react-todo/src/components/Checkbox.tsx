export function Checkbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`
        flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all duration-200
        flex items-center justify-center cursor-pointer
        ${
          checked
            ? 'bg-(--color-accent) border-(--color-accent) animate-check-pop'
            : 'border-(--color-text-muted) hover:border-(--color-accent-hover)'
        }
      `}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {checked && (
        <svg
          className="w-3 h-3 text-white"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 6L5 8.5L9.5 3.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </label>
  );
}
