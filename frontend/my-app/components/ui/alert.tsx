import type { ReactNode } from "react";

import styles from "./alert.module.css";

type AlertProps = {
  /** `error` interrupts assistive technology (role=alert); `success` waits (role=status). */
  tone: "error" | "success";
  children: ReactNode;
};

export default function Alert({ tone, children }: AlertProps) {
  return (
    <p role={tone === "error" ? "alert" : "status"} data-tone={tone} className={styles.alert}>
      {children}
    </p>
  );
}
