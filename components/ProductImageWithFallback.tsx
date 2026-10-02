"use client";

// ProductImageWithFallback — renders the first candidate that actually loads;
// when every candidate fails (or there is none) shows the brand placeholder:
// the Floropolis isotype centred with "Picture coming soon" underneath.
// v1 | 2026-10-01 | Job_PM (jj/permanent-catalog, photo recovery)
//
// Guarantees:
//   - The browser's broken-image icon and the product alt text are NEVER
//     visible: the <img> stays at opacity 0 until its `load` event confirms a
//     real bitmap (naturalWidth > 0). An error — or a "load" of an empty
//     bitmap — advances to the next candidate.
//   - Keeps the parent's box: with `fill` the image and the placeholder are
//     both absolutely positioned inside the caller's `relative` container, so
//     the aspect ratio and layout never jump.
//   - Hosts the Next image optimizer is not configured for are loaded
//     `unoptimized` (direct), otherwise the optimizer would answer 400.
//   - No infinite loops: candidates are tried at most once each; if even the
//     isotype fails, only the caption remains.
//   - State resets whenever the candidate list changes (new product, gallery
//     selection, etc.).

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  isOptimizableImageSrc,
  PICTURE_COMING_SOON_LABEL,
  PRODUCT_IMAGE_FALLBACK_SRC,
} from "@/lib/product-image-candidates";

export interface ProductImageWithFallbackProps {
  /** Ordered srcs to try (see lib/product-image-candidates.ts). */
  candidates: readonly string[];
  /** Product alt text; kept for assistive tech, never shown as broken-image text. */
  alt: string;
  /** Fill the parent (parent must be `relative` and sized). */
  fill?: boolean;
  /** Fixed box when not using `fill`. */
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  /** Classes for the <img> (e.g. "object-contain group-hover:scale-105"). */
  className?: string;
  /** Extra classes for the placeholder box. */
  placeholderClassName?: string;
  /** Size of the isotype, e.g. "w-10" for tiny thumbnails. */
  iconClassName?: string;
  /** Caption classes, e.g. "text-[9px]" for tiny thumbnails. */
  labelClassName?: string;
}

export default function ProductImageWithFallback({
  candidates,
  alt,
  fill = false,
  width,
  height,
  sizes,
  priority = false,
  className = "",
  placeholderClassName = "",
  iconClassName = "w-1/3 max-w-[96px]",
  labelClassName = "text-xs",
}: ProductImageWithFallbackProps) {
  const candidatesKey = candidates.join("\u0000");

  const [trackedKey, setTrackedKey] = useState(candidatesKey);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  // Reset when the source list changes (React's "adjust state on prop change").
  if (trackedKey !== candidatesKey) {
    setTrackedKey(candidatesKey);
    setIndex(0);
    setLoaded(false);
    setExhausted(false);
    setLogoFailed(false);
  }

  const src = exhausted ? null : (candidates[index] ?? null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const advance = () => {
    if (index + 1 < candidates.length) {
      setIndex(index + 1);
      setLoaded(false);
    } else {
      setExhausted(true);
    }
  };

  // Settle an image whose load/error events may already have fired (e.g. the
  // server-rendered <img> finished before hydration, or next/image re-assigned
  // `src` on mount and swallowed the second load event): a complete element
  // with a bitmap is loaded, a complete element without one has failed, and
  // an element still in flight will report through its own events.
  const settle = (img: HTMLImageElement) => {
    if (!img.isConnected) return;
    if (img.naturalWidth > 0) {
      setLoaded(true);
    } else if (img.complete) {
      advance();
    } else if (typeof img.decode === "function") {
      img
        .decode()
        .then(() => settleOnce(img, true))
        .catch(() => settleOnce(img, false));
    }
  };
  const settleOnce = (img: HTMLImageElement, decoded: boolean) => {
    if (!img.isConnected) return;
    if (decoded && img.naturalWidth > 0) setLoaded(true);
    else if (img.complete) advance();
  };

  useEffect(() => {
    if (imgRef.current && src) settle(imgRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // ---- Placeholder (Priority B) --------------------------------------------
  if (!src) {
    const boxStyle = fill ? undefined : { width, height };
    return (
      <div
        role="img"
        aria-label={`${alt} — ${PICTURE_COMING_SOON_LABEL}`}
        data-product-image="fallback"
        className={`${fill ? "absolute inset-0" : "relative"} flex flex-col items-center justify-center gap-2 bg-slate-50 text-center ${placeholderClassName}`}
        style={boxStyle}
      >
        {!logoFailed && (
          <Image
            src={PRODUCT_IMAGE_FALLBACK_SRC}
            alt=""
            width={96}
            height={96}
            unoptimized
            className={`h-auto object-contain opacity-80 ${iconClassName}`}
            onError={() => setLogoFailed(true)}
          />
        )}
        <span className={`font-medium text-slate-500 leading-tight px-2 ${labelClassName}`}>
          {PICTURE_COMING_SOON_LABEL}
        </span>
      </div>
    );
  }

  // ---- Candidate image -------------------------------------------------------
  const common = {
    src,
    alt,
    sizes,
    priority,
    unoptimized: !isOptimizableImageSrc(src),
    draggable: false,
    className: `${className} transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`,
    // A failed image can still be "complete" (and even decoded): only a real
    // bitmap counts as loaded. A premature load event (image still in flight)
    // is settled through decode(); a complete image without a bitmap fails.
    onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => settle(event.currentTarget),
    onError: () => advance(),
  } as const;

  const state = loaded ? "loaded" : "loading";
  return fill ? (
    <Image
      key={src}
      ref={imgRef}
      {...common}
      fill
      data-product-image={state}
      data-candidate-index={index}
    />
  ) : (
    <Image
      key={src}
      ref={imgRef}
      {...common}
      width={width ?? 96}
      height={height ?? 96}
      data-product-image={state}
      data-candidate-index={index}
    />
  );
}
