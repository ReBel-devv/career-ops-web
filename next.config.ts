import type { NextConfig } from "next";
import { assertDeployGuard } from "./lib/config/guard";

// Privacy gate: a Vercel build without DEMO_MODE must fail (plan §5/§7).
assertDeployGuard(process.env);

const nextConfig: NextConfig = {};

export default nextConfig;
