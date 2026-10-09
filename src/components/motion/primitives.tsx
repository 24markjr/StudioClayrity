"use client";

import { AnimatePresence, MotionConfig, motion, type HTMLMotionProps } from "motion/react";
import { Fragment, type ElementType, type ReactNode } from "react";
import { duration, ease, revealDistance, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils/cn";

/**
 * App-wide motion settings. `reducedMotion="user"` makes Motion drop transform/layout
 * animations (keeping gentle opacity fades) when the OS asks for reduced motion.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: duration.base, ease: ease.outSoft }}>
      {children}
    </MotionConfig>
  );
}

/**
 * Fades and lifts content into place the first time it scrolls into view.
 * Marked with `data-reveal` so the <noscript> rule in the root layout can show it without JS.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
  ...props
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
} & Omit<HTMLMotionProps<"div">, "children">) {
  const Component = motion[as] as typeof motion.div;
  return (
    <Component
      data-reveal=""
      initial={{ opacity: 0, y: revealDistance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: duration.reveal, ease: ease.outQuint, delay }}
      className={className}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * Headline that rises word by word from behind a mask. Screen readers get the full
 * sentence once (aria-label); the animated word spans are hidden from them.
 */
export function StaggerText({
  text,
  as: Tag = "span",
  className,
  delay = 0,
  trigger = "mount",
}: {
  text: string;
  as?: ElementType;
  className?: string;
  delay?: number;
  /** "mount" for above-the-fold headlines, "inView" for headlines further down the page */
  trigger?: "mount" | "inView";
}) {
  const words = text.split(" ");
  const animateProps =
    trigger === "mount"
      ? { initial: "hidden", animate: "visible" }
      : { initial: "hidden", whileInView: "visible", viewport: { once: true, margin: "0px 0px -10% 0px" } };

  return (
    <Tag aria-label={text} className={className}>
      <motion.span
        aria-hidden="true"
        data-reveal=""
        className="inline"
        variants={{ visible: { transition: { staggerChildren: stagger, delayChildren: delay } } }}
        {...animateProps}
      >
        {words.map((word, i) => (
          <Fragment key={`${word}-${i}`}>
            {/* Space lives outside the inline-block, otherwise it collapses */}
            {i > 0 && " "}
            <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
              <motion.span
                className="inline-block will-change-transform"
                variants={{
                  hidden: { y: "105%" },
                  visible: { y: "0%", transition: { duration: 0.9, ease: ease.outQuint } },
                }}
              >
                {word}
              </motion.span>
            </span>
          </Fragment>
        ))}
      </motion.span>
    </Tag>
  );
}

/**
 * Image reveal: the frame wipes open from the bottom while the image settles from a
 * slight zoom. Wrap a <ResponsiveImage> or <PlaceholderImage>.
 */
export function MaskReveal({
  children,
  className,
  delay = 0,
  trigger = "mount",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  trigger?: "mount" | "inView";
}) {
  const state =
    trigger === "mount"
      ? { initial: "hidden", animate: "visible" }
      : { initial: "hidden", whileInView: "visible", viewport: { once: true, margin: "0px 0px -10% 0px" } };
  return (
    <motion.div
      data-reveal=""
      className={cn("overflow-hidden", className)}
      variants={{
        hidden: { clipPath: "inset(100% 0% 0% 0%)" },
        visible: {
          clipPath: "inset(0% 0% 0% 0%)",
          transition: { duration: 1.1, ease: ease.inOutCubic, delay },
        },
      }}
      {...state}
    >
      <motion.div
        variants={{
          hidden: { scale: 1.08 },
          visible: { scale: 1, transition: { duration: 1.6, ease: ease.outQuint, delay } },
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Cross-fades content when `id` changes (gallery images, variant info, step content). */
export function FadeSwap({
  id,
  children,
  className,
}: {
  id: string | number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: duration.base, ease: ease.outSoft }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Number that springs when it changes — used for the bag count. */
export function AnimatedCount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("relative inline-flex overflow-hidden tabular-nums", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "-100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.8 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
