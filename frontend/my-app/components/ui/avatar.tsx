import styles from "./avatar.module.css";

type AvatarProps = {
  initials: string;
  size?: "sm" | "md";
};

/** Initials in a disc. Decorative: the name next to it is what assistive technology reads. */
export default function Avatar({ initials, size = "md" }: AvatarProps) {
  return (
    <span className={styles.avatar} data-size={size} aria-hidden="true">
      {initials}
    </span>
  );
}
