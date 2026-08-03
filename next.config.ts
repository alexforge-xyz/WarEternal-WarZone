import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phone / LAN testing of `next dev` (HMR and /_next/*). Dev-only; production
  // is unaffected. Add another host if your LAN IP changes.
  allowedDevOrigins: ["192.168.1.27"],
};

export default nextConfig;
