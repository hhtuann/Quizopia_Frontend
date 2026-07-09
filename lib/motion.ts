import type { Variants } from "framer-motion";

/** DESIGN_NEXT easing curve — smooth, confident deceleration. */
export const easeOut = [0.16, 1, 0.3, 1] as const;

/** Fade up entrance — content rises into view (28px, 0.7s). */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: easeOut } },
};

/** Simple fade entrance. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.7, ease: easeOut } },
};

/** Stagger children — 0.1s delay between each, 0.1s initial delay. */
export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};

/** Viewport options for scroll-triggered entrance animations. */
export const viewportOnce = { once: true, amount: 0.15, margin: "-60px" } as const;
