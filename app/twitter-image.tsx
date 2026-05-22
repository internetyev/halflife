// Default site-level Twitter/X share card.
//
// Re-exports the Open Graph image so `twitter:image` resolves to the same
// branded card. Without this file Next would emit no `twitter:image`, leaving
// the report page's `twitter: { card: "summary_large_image" }` declaration
// pointing at nothing — a large-image card with a blank image. One source of
// truth: edit `app/opengraph-image.tsx` and both cards update.

export { default, alt, size, contentType, runtime } from "./opengraph-image";
