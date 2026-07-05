// Ambient declaration for side-effect CSS imports (e.g. app/globals.css).
// Next.js provides this via its own types at build time; declaring it here
// keeps plain `tsc --noEmit` green in any environment.
declare module "*.css";
