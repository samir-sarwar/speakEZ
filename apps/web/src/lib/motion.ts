import type { Variants } from "framer-motion";

export const spring = {
  type: "spring",
  stiffness: 420,
  damping: 28,
  mass: 0.85
} as const;

export const quickSpring = {
  type: "spring",
  stiffness: 620,
  damping: 24,
  mass: 0.7
} as const;

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { ...spring, staggerChildren: 0.045 } },
  exit: { opacity: 0, y: -12, scale: 0.99, transition: { duration: 0.16, ease: "easeInOut" } }
};

export const cardVariants: Variants = {
  initial: { opacity: 0, y: 16, rotate: -0.4 },
  animate: { opacity: 1, y: 0, rotate: 0, transition: spring },
  exit: { opacity: 0, y: -8, transition: { duration: 0.14 } }
};

export const listVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } }
};

export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, x: -10, transition: { duration: 0.12 } }
};

export const panelSwapVariants: Variants = {
  initial: { opacity: 0, x: 18, scale: 0.985 },
  animate: { opacity: 1, x: 0, scale: 1, transition: spring },
  exit: { opacity: 0, x: -18, scale: 0.985, transition: { duration: 0.16 } }
};

export const popVariants: Variants = {
  initial: { opacity: 0, scale: 0.92, rotate: -1.5 },
  animate: { opacity: 1, scale: 1, rotate: 0, transition: quickSpring },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.12 } }
};

export const buttonMotion = {
  whileHover: { y: -2, scale: 1.015 },
  whileTap: { y: 1, scale: 0.985 },
  transition: quickSpring
} as const;
