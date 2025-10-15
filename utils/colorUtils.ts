/**
 * Color utility functions for generating cohesive theme palettes
 */

// Convert hex to HSL
export function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return [h * 360, s * 100, l * 100];
}

// Convert HSL to hex
export function hslToHex(h: number, s: number, l: number): string {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Generate a cohesive color palette from a single primary color
export function generateColorPalette(primaryColor: string, mode: 'light' | 'dark' = 'dark') {
  const [h, s, l] = hexToHsl(primaryColor);

  if (mode === 'light') {
    // Light mode: lighter version of selected color background with white glass menus
    return {
      primary: hslToHex(h, Math.min(s + 20, 90), Math.max(l - 30, 25)), // Vibrant primary for text/accents
      secondary: hslToHex((h + 120) % 360, Math.min(s + 15, 85), Math.max(l - 25, 30)),
      accent: hslToHex((h + 60) % 360, Math.min(s + 10, 80), Math.max(l - 20, 35)),
      background: hslToHex(h, Math.max(s - 30, 20), 95), // Very light version of selected color
      foreground: '#1a1a1a', // Dark text for contrast
      surface: '#ffffff', // Pure white surfaces
      border: 'rgba(0, 0, 0, 0.08)', // Very light borders
      muted: '#6b7280', // Standard gray
      cardBg: '#ffffff', // White cards
      glassBg: 'rgba(255, 255, 255, 0.15)', // Very transparent white glass to see animation
      glassBorder: 'rgba(255, 255, 255, 0.3)', // Subtle white glass border
    };
  } else {
    // Dark mode: darker version of selected color background with black glass menus
    return {
      primary: primaryColor,
      secondary: hslToHex((h + 120) % 360, Math.max(s - 10, 30), Math.min(l + 10, 70)),
      accent: hslToHex((h + 60) % 360, Math.max(s - 5, 40), Math.min(l + 5, 65)),
      background: hslToHex(h, Math.max(s - 30, 25), 8), // Very dark version of selected color
      foreground: '#ffffff', // White text
      surface: '#1a1a1a', // Dark surfaces
      border: 'rgba(255, 255, 255, 0.08)', // Very subtle borders
      muted: '#9ca3af', // Light gray
      cardBg: '#1a1a1a', // Dark cards
      glassBg: 'rgba(0, 0, 0, 0.2)', // Very transparent black glass to see animation
      glassBorder: 'rgba(255, 255, 255, 0.15)', // Very subtle white border on black glass
    };
  }
}

// Convert hex color to Vanta.js format (0xRRGGBB)
export function hexToVantaColor(hex: string): number {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  return parseInt(cleanHex, 16);
}

// Preset color options for quick selection
export const presetColors = [
  '#4f46e5', // Indigo
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#6366f1', // Violet
];
