import Link from "next/link";
import type { AnchorHTMLAttributes, ComponentProps } from "react";

import styles from "./button.module.css";

type Look = {
  variant?: "accent" | "ghost" | "danger";
  /** `sm` matches toolbar controls; `md` is for forms and page-level actions. */
  size?: "sm" | "md";
};

type ButtonProps = ComponentProps<"button"> &
  Look & {
    /**
     * Unavailable for now (busy, or nothing to do), but still focusable: unlike `disabled`,
     * a focused button that becomes unavailable keeps keyboard focus. Clicks are ignored,
     * which also keeps a submit button from sending its form twice.
     */
    softDisabled?: boolean;
  };

function classes(className?: string) {
  return className ? `${styles.button} ${className}` : styles.button;
}

/**
 * The app's button. `accent` is the one primary action of a view; `danger` confirms an
 * action that takes something away, such as deactivating an account.
 */
export default function Button({
  variant = "accent",
  size = "md",
  type = "button",
  className,
  softDisabled = false,
  onClick,
  ...button
}: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      data-size={size}
      className={classes(className)}
      aria-disabled={softDisabled || undefined}
      onClick={(event) => {
        if (softDisabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...button}
    />
  );
}

type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  Pick<ComponentProps<typeof Link>, "href"> &
  Look;

/** A link that looks like a button, for actions that are really navigation. */
export function ButtonLink({ variant = "accent", size = "md", className, ...link }: ButtonLinkProps) {
  return (
    <Link data-variant={variant} data-size={size} className={classes(className)} {...link} />
  );
}
