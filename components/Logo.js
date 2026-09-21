import Image from "next/image";
import lockup from "../public/brand/maximus-gps-lockup.png";

/** Official MAXIMUS GPS lockup — raster source, cropped only. Never redrawn. */
export default function Logo({ height = 40, priority = false }) {
  const width = Math.round((lockup.width / lockup.height) * height);
  return <Image src={lockup} alt="MAXIMUS GPS — Your Navigation in the World of Tennis" width={width} height={height} priority={priority} />;
}
