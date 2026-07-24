import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const HEX_PATTERN = /^#?[0-9a-f]{6}$/iu;

/**
 * Parses a '#rrggbb' or 'rrggbb' hex colour string into its three 8-bit channel values.
 *
 * @param hex - The hex colour string to parse.
 *
 * @throws BadRequestHttpError if the string is not a valid 6-digit hex colour.
 */
function parseHex(hex: string): { r: number; g: number; b: number } {
  if (!HEX_PATTERN.test(hex)) {
    throw new BadRequestHttpError(`Invalid hex colour: ${hex}`);
  }
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

/**
 * Converts an 8-bit colour channel value into its linearised component per WCAG 2.x.
 *
 * @param channel - The 8-bit channel value (0-255).
 */
function linearizeChannel(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/**
 * Calculates the relative luminance of a colour per WCAG 2.x.
 *
 * @param color - The colour channels.
 * @param color.r - The red channel (0-255).
 * @param color.g - The green channel (0-255).
 * @param color.b - The blue channel (0-255).
 */
function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const linR = linearizeChannel(color.r);
  const linG = linearizeChannel(color.g);
  const linB = linearizeChannel(color.b);
  return (0.2126 * linR) + (0.7152 * linG) + (0.0722 * linB);
}

/**
 * Calculates the WCAG contrast ratio between two colours, rounded to 2 decimals.
 *
 * @param hexA - The first colour as a '#rrggbb' or 'rrggbb' hex string.
 * @param hexB - The second colour as a '#rrggbb' or 'rrggbb' hex string.
 *
 * @throws BadRequestHttpError if either colour string is invalid.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(parseHex(hexA));
  const luminanceB = relativeLuminance(parseHex(hexB));
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Determines whether two colours meet a given WCAG contrast level.
 *
 * @param hexA - The first colour as a '#rrggbb' or 'rrggbb' hex string.
 * @param hexB - The second colour as a '#rrggbb' or 'rrggbb' hex string.
 * @param level - The WCAG conformance level, 'AA' or 'AAA'.
 * @param largeText - Whether the text being evaluated is large text.
 *
 * @throws BadRequestHttpError if either colour string is invalid.
 */
export function meetsWcag(hexA: string, hexB: string, level: 'AA' | 'AAA', largeText: boolean): boolean {
  let threshold: number;
  if (level === 'AA') {
    threshold = largeText ? 3 : 4.5;
  } else {
    threshold = largeText ? 4.5 : 7;
  }
  return contrastRatio(hexA, hexB) >= threshold;
}
