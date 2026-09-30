import Image from "next/image";
import lockup from "../public/brand/maximus-gps-lockup-tight.png";
import emblem from "../public/brand/maximus-lion-emblem.png";

/**
 * Official MAXIMUS GPS lockup — raster source, cropped only. Never redrawn.
 * The source file carries empty padding around the artwork; this asset is the same lockup with
 * that padding removed, so `height` is the height of the VISIBLE lion and wordmark, not of a box
 * with black margins. The header sizes it in CSS (.site-logo img) so the visible artwork keeps
 * its intended share of the header at every width.
 */
export default function Logo({ height = 40, priority = false, className }) {
  const width = Math.round((lockup.width / lockup.height) * height);
  return (
    <Image
      src={lockup}
      alt="MAXIMUS GPS — Your Navigation in the World of Tennis"
      width={width}
      height={height}
      className={className}
      priority={priority}
      loading={priority ? undefined : "eager"}
      sizes="(min-width: 1180px) 330px, 290px"
    />
  );
}

/**
 * Compact brand mark: the official lion alone, same artwork, never redrawn. Used on narrow
 * screens, where the full lockup and the language menu cannot both sit in the header without
 * shrinking the lion below its intended share of the header height.
 */
export function LogoMark({ height = 52, priority = false, className }) {
  return (
    <Image
      src={emblem}
      alt="MAXIMUS GPS"
      width={height}
      height={height}
      className={className}
      priority={priority}
      loading={priority ? undefined : "eager"}
      sizes="64px"
    />
  );
}
