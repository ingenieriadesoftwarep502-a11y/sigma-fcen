"use client";

import Image, { type StaticImageData } from "next/image";
import { useState } from "react";

import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import atardecer from "@/public/images/login/campus-la-nubia-atardecer.jpg";
import aerea from "@/public/images/login/campus-la-nubia-aerea.jpg";
import laboratorio from "@/public/images/login/laboratorio.jpg";
import manizales from "@/public/images/login/sede-manizales.jpg";

import styles from "./campus-carousel.module.css";

type Slide = { src: StaticImageData; focus: string; drift: "left" | "right" };

const SLIDES: readonly Slide[] = [
  { src: atardecer, focus: "60% 55%", drift: "left" },
  { src: laboratorio, focus: "50% 40%", drift: "right" },
  { src: aerea, focus: "50% 60%", drift: "left" },
  { src: manizales, focus: "55% 50%", drift: "right" },
];

/**
 * Full-bleed campus photos that take turns behind the auth card. The photos are
 * decorative; the controls are not. With reduced motion the rotation starts paused.
 */
export default function CampusCarousel() {
  const [active, setActive] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [pausedByViewer, setPausedByViewer] = useState<boolean | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const paused = pausedByViewer ?? prefersReducedMotion;

  function show(index: number) {
    if (index === active) return;
    setPrevious(active);
    setActive(index);
  }

  return (
    <>
      <div className={styles.carousel} aria-hidden="true">
        {SLIDES.map((slide, index) => (
          <div
            key={index}
            data-slide={index}
            data-active={index === active}
            data-previous={index === previous}
            data-drift={slide.drift}
            className={styles.slide}
          >
            <Image
              src={slide.src}
              alt=""
              fill
              sizes="100vw"
              preload={index === 0}
              style={{ objectFit: "cover", objectPosition: slide.focus }}
            />
          </div>
        ))}
        <div className={styles.veil} />
      </div>

      <div className={styles.controls} data-paused={paused}>
        <ol className={styles.dots}>
          {SLIDES.map((_, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => show(index)}
                aria-label={`Ver foto ${index + 1} de ${SLIDES.length}`}
                aria-current={index === active}
                className={styles.dot}
              >
                <span
                  data-testid={`slide-progress-${index}`}
                  className={styles.fill}
                  onAnimationEnd={() => {
                    if (index === active && !paused) show((active + 1) % SLIDES.length);
                  }}
                />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setPausedByViewer(!paused)}
          aria-label={paused ? "Reanudar fotos" : "Pausar fotos"}
          className={styles.toggle}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor">
            {paused ? (
              <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" />
            ) : (
              <path d="M4 2.5h2.6v11H4zM9.4 2.5H12v11H9.4z" />
            )}
          </svg>
        </button>
      </div>
    </>
  );
}
