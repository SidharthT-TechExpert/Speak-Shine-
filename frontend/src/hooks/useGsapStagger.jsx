import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * useGsapEntrance
 * Staggers in child elements matching `selector` with a subtle vertical glide and fade.
 *
 * @param {Object} options
 * @param {string} options.selector - CSS selector inside container (e.g. ".stat-card")
 * @param {number} options.y - Vertical displacement in pixels (default: 20)
 * @param {number} options.stagger - Delay between elements (default: 0.08s)
 * @param {number} options.duration - Duration of animation (default: 0.55s)
 * @param {Array} options.deps - Dependency array to trigger animation on update
 */
export function useGsapEntrance({
  selector = ".gsap-fade-in",
  y = 20,
  stagger = 0.08,
  duration = 0.55,
  deps = [],
} = {}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      const targets = containerRef.current.querySelectorAll(selector);
      if (!targets || targets.length === 0) return;

      gsap.fromTo(
        targets,
        {
          opacity: 0,
          y,
        },
        {
          opacity: 1,
          y: 0,
          duration,
          stagger,
          ease: "power3.out",
          clearProps: "transform,opacity",
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, deps);

  return containerRef;
}

/**
 * AnimatedNumber
 * A clean inline component that smoothly counts up to `value` using GSAP.
 */
export function AnimatedNumber({ value = 0, duration = 0.8, prefix = "", suffix = "" }) {
  const numRef = useRef(null);
  const targetVal = Number(value) || 0;

  useEffect(() => {
    if (!numRef.current) return;
    const obj = { val: 0 };
    const tween = gsap.to(obj, {
      val: targetVal,
      duration,
      ease: "power2.out",
      onUpdate: () => {
        if (numRef.current) {
          numRef.current.textContent = `${prefix}${Math.round(obj.val)}${suffix}`;
        }
      },
    });

    return () => tween.kill();
  }, [targetVal, duration, prefix, suffix]);

  return <span ref={numRef}>{prefix}{targetVal}{suffix}</span>;
}
