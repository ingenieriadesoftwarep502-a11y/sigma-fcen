import type { ButtonHTMLAttributes } from "react";

import styles from "./button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "accent" | "ghost";
};

/** The app's button. `accent` is the one primary action of a view. */
export default function Button({
  variant = "accent",
  type = "button",
  className,
  ...button
}: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      className={className ? `${styles.button} ${className}` : styles.button}
      {...button}
    />
  );
}
