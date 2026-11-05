/**
 * The Quizopia brand mark — an exact inline copy of `app/icon.svg`
 * (gradient rounded square + bolt), with the optional wordmark used in the
 * Topbar and the view-switch transition screen. Single source so the logo
 * never drifts between surfaces.
 */
export function QuizopiaLogo({
  withWordmark = false,
  wordmarkClassName = "",
  className = "",
}: {
  withWordmark?: boolean;
  /** Extra classes for the wordmark span (e.g. `hidden lg:inline` in the Topbar). */
  wordmarkClassName?: string;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-6 w-6"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904 9 21l8.982-11.861H13.62l.812-5.043L5.45 15.904h4.363Z"
          />
        </svg>
      </span>
      {withWordmark && (
        <span className={`font-display text-2xl tracking-tight text-[#0F172A] ${wordmarkClassName}`}>
          Quiz<span className="gradient-text">opia</span>
        </span>
      )}
    </span>
  );
}
