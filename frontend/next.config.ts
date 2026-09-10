import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This app lives in frontend/ inside the Vault monorepo, which has its
  // own root package-lock.json; pin the workspace root so Next doesn't
  // have to guess between the two lockfiles.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
