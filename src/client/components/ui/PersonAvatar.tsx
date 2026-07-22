import { useEffect, useState, type ReactNode } from "react";

/**
 * Circular avatar that renders `src` as an image, but falls back to the given
 * `fallback` node (initials) if there's no src OR the image fails to load.
 * Guards against stale/expired photo URLs (e.g. rotated Zoom CDN links) showing
 * a broken-image glyph.
 */
export default function PersonAvatar({
  src,
  alt,
  size,
  fallback,
}: {
  src?: string | null;
  alt?: string;
  size: number;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  // Re-arm when the URL changes so a new src gets a fresh chance to load.
  useEffect(() => { setFailed(false); }, [src]);

  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt ?? ""}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
    />
  );
}
