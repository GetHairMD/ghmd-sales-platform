import type { Config } from "tailwindcss";
import {
  color,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
  spacing,
  radius,
  elevation,
  motion,
} from "./src/design/tokens";

/**
 * Tailwind theme is a thin projection of `src/design/tokens.ts` (PRD §4.2).
 * Do not add color/type/spacing values here that don't exist as tokens.
 *
 * Tokens are declared `as const` for consumer DX; Tailwind's theme types are
 * mutable, so array/tuple tokens are widened here (values are unchanged).
 */
type DeepWritable<T> = T extends readonly [unknown, ...unknown[]]
  ? { -readonly [K in keyof T]: DeepWritable<T[K]> } // preserve tuple arity (fontSize)
  : T extends readonly (infer U)[]
  ? DeepWritable<U>[]
  : T extends object
  ? { -readonly [K in keyof T]: DeepWritable<T[K]> }
  : T;
const writable = <T>(v: T) => v as unknown as DeepWritable<T>;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/design/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ...color,
        // Scaffold aliases retained so pre-existing utilities keep resolving.
        background: color.bg.DEFAULT,
        foreground: color.text.DEFAULT,
      },
      fontFamily: {
        heading: writable(fontFamily.heading),
        body: writable(fontFamily.body),
        sans: writable(fontFamily.body), // default sans = Poppins (body/UI)
        serif: writable(fontFamily.serif),
        mono: writable(fontFamily.mono),
      },
      fontSize: writable(fontSize),
      fontWeight,
      letterSpacing,
      spacing,
      borderRadius: radius,
      boxShadow: elevation,
      transitionDuration: motion.duration,
      transitionTimingFunction: motion.easing,
    },
  },
  plugins: [],
};
export default config;
