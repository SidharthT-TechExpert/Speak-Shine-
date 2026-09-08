import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useTheme } from "../context/ThemeContext.jsx";

export default function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const { isDark } = useTheme();
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    // Only enable on desktop with fine mouse pointer
    if (typeof window === "undefined") return;
    const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    if (isTouch) {
      setIsEnabled(false);
      return;
    }

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    // High performance quickTo setters for 120fps fluid tracking
    const setDotX = gsap.quickTo(dot, "x", { duration: 0.08, ease: "power3" });
    const setDotY = gsap.quickTo(dot, "y", { duration: 0.08, ease: "power3" });
    const setRingX = gsap.quickTo(ring, "x", { duration: 0.32, ease: "power2.out" });
    const setRingY = gsap.quickTo(ring, "y", { duration: 0.32, ease: "power2.out" });

    let isHoveringInteractive = false;

    const onMouseMove = (e) => {
      setDotX(e.clientX);
      setDotY(e.clientY);
      setRingX(e.clientX);
      setRingY(e.clientY);
    };

    const onMouseDown = () => {
      gsap.to(dot, { scale: 0.6, duration: 0.15, ease: "power2.out" });
      gsap.to(ring, { scale: isHoveringInteractive ? 1.6 : 0.75, duration: 0.15, ease: "power2.out" });
    };

    const onMouseUp = () => {
      gsap.to(dot, { scale: 1, duration: 0.25, ease: "back.out(2)" });
      gsap.to(ring, { scale: isHoveringInteractive ? 2.2 : 1, duration: 0.25, ease: "back.out(2)" });
    };

    const onMouseEnterWindow = () => {
      gsap.to([dot, ring], { opacity: 1, duration: 0.2 });
    };

    const onMouseLeaveWindow = () => {
      gsap.to([dot, ring], { opacity: 0, duration: 0.2 });
    };

    // Detect interactable element hover
    const onMouseOver = (e) => {
      const target = e.target;
      if (!target) return;
      const interactive = target.closest(
        'button, a, input, textarea, select, [role="button"], .speakshine-nav-item, .card, .speakshine-card-box, .vocab-card-pro, .leaderboard-row, .tab-btn'
      );

      if (interactive && !isHoveringInteractive) {
        isHoveringInteractive = true;
        gsap.to(ring, {
          scale: 1.35,
          borderColor: isDark ? "rgba(251, 191, 36, 0.85)" : "rgba(99, 102, 241, 0.85)",
          backgroundColor: "transparent",
          duration: 0.2,
          ease: "power2.out",
        });
        gsap.to(dot, {
          scale: 1.1,
          backgroundColor: isDark ? "#fbbf24" : "#6366f1",
          duration: 0.2,
        });
      } else if (!interactive && isHoveringInteractive) {
        isHoveringInteractive = false;
        gsap.to(ring, {
          scale: 1,
          borderColor: isDark ? "rgba(167, 139, 250, 0.45)" : "rgba(100, 116, 139, 0.45)",
          backgroundColor: "transparent",
          duration: 0.2,
          ease: "power2.out",
        });
        gsap.to(dot, {
          scale: 1,
          backgroundColor: isDark ? "#a78bfa" : "#6366f1",
          duration: 0.2,
        });
      }
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("mouseenter", onMouseEnterWindow);
    document.addEventListener("mouseleave", onMouseLeaveWindow);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseenter", onMouseEnterWindow);
      document.removeEventListener("mouseleave", onMouseLeaveWindow);
    };
  }, [isDark]);

  if (!isEnabled) return null;

  return (
    <div className="speakshine-cursor-portal" aria-hidden="true" style={{ pointerEvents: "none" }}>
      {/* Precision Inner Dot */}
      <div
        ref={dotRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 6,
          height: 6,
          marginTop: -3,
          marginLeft: -3,
          borderRadius: "50%",
          backgroundColor: isDark ? "#a78bfa" : "#6366f1",
          zIndex: 999999,
          pointerEvents: "none",
          transform: "translate(-100px, -100px)",
          willChange: "transform",
        }}
      />

      {/* Smooth Trailing Follower Ring - Crystal Clear Without Blur */}
      <div
        ref={ringRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: 28,
          height: 28,
          marginTop: -14,
          marginLeft: -14,
          borderRadius: "50%",
          border: isDark ? "1.5px solid rgba(167, 139, 250, 0.45)" : "1.5px solid rgba(100, 116, 139, 0.45)",
          backgroundColor: "transparent",
          zIndex: 999998,
          pointerEvents: "none",
          transform: "translate(-100px, -100px)",
          willChange: "transform, border-color",
          transition: "border-color 0.2s ease",
        }}
      />
    </div>
  );
}
