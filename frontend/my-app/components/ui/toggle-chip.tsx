import type { ComponentProps } from "react";

import styles from "./toggle-chip.module.css";

type ToggleChipProps = Omit<ComponentProps<"button">, "type" | "aria-pressed"> & {
  pressed: boolean;
};

/** A filter that is on or off (aria-pressed), shaped as a pill. */
export default function ToggleChip({ pressed, className, ...button }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={className ? `${styles.chip} ${className}` : styles.chip}
      {...button}
    />
  );
}
