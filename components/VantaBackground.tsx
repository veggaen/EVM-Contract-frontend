"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useCustomTheme } from "../contexts/ThemeContext";
import { hexToVantaColor } from "../utils/colorUtils";

type VantaEffect = { destroy: () => void };

type VantaNetInit = (opts: {
  el: HTMLElement;
  mouseControls?: boolean;
  touchControls?: boolean;
  gyroControls?: boolean;
  minHeight?: number;
  minWidth?: number;
  scale?: number;
  scaleMobile?: number;
  backgroundColor?: string | number;
  color?: string | number;
  points?: number;
  maxDistance?: number;
  spacing?: number;
  showDots?: boolean;
}) => VantaEffect;

declare global {
  interface Window {
    VANTA?: { NET?: VantaNetInit };
    THREE?: unknown;
  }
}

export default function VantaBackground() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [threeReady, setThreeReady] = useState(false);
  const [vantaReady, setVantaReady] = useState(false);
  const effectRef = useRef<VantaEffect | null>(null);
  const { mode, customColors } = useCustomTheme();

  useEffect(() => {
    if (!ref.current) return;
    const VANTA = window.VANTA;
    const THREE = window.THREE;
    const init = VANTA?.NET;

    if (init && THREE && ref.current) {
      // Destroy existing effect if it exists
      if (effectRef.current) {
        try {
          effectRef.current.destroy();
        } catch {}
        effectRef.current = null;
      }

      // Get theme-appropriate colors in Vanta.js format
      // Background should be the selected color, animation should be complementary
      let backgroundColor, color;
      if (mode === 'light') {
        // Light mode: light colored background with darker animation lines
        backgroundColor = hexToVantaColor(customColors.background); // Light colored background
        color = hexToVantaColor(customColors.primary); // Primary color for animation lines
      } else {
        // Dark mode: dark colored background with bright animation lines
        backgroundColor = hexToVantaColor(customColors.background); // Dark colored background
        color = hexToVantaColor(customColors.primary); // Primary color for animation lines
      }

      effectRef.current = init({
        el: ref.current,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
        backgroundColor: backgroundColor,
        color: color,
        points: 5.0,
        maxDistance: 17.0,
        spacing: 20.0,
        showDots: false,
      });
    }

    return () => {
      if (effectRef.current) {
        try { effectRef.current.destroy(); } catch {}
        effectRef.current = null;
      }
    };
  }, [threeReady, vantaReady, mode, customColors]);

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"
        strategy="afterInteractive"
        onLoad={() => setThreeReady(true)}
      />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/vanta/0.5.24/vanta.net.min.js"
        strategy="afterInteractive"
        onLoad={() => setVantaReady(true)}
      />
      <div ref={ref} className="fixed inset-0 -z-10" />
    </>
  );
}

