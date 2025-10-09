"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

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

  useEffect(() => {
    if (!ref.current) return;
    const VANTA = window.VANTA;
    const THREE = window.THREE;
      const init = VANTA?.NET;
    if (init && THREE && !effectRef.current && ref.current) {
      effectRef.current = init({
        el: ref.current,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.0,
        minWidth: 200.0,
        scale: 1.0,
        scaleMobile: 1.0,
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
  }, [threeReady, vantaReady]);

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

