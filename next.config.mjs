import { execSync } from 'child_process';
import { PROJECT_PATHS } from './project.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  distDir: 'out',
  eslint: {
    dirs: PROJECT_PATHS.sourceArray,
  },
  webpack: (config, { dev, isServer }) => {
    if (!dev && isServer) {
      // ビルド時にコード重複チェックを実行
      try {
        execSync('npm run cpd-check', { stdio: 'inherit' });
      } catch (error) {
        console.warn('⚠️  WARNING: Code duplication detected. Check output/reports/jscpd/ for details.');
        // warningとして表示するだけで、ビルドは継続
      }
    }
    return config;
  }
};

export default nextConfig;
