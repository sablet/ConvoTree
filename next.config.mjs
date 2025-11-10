import { execSync } from 'child_process';
import { PROJECT_PATHS } from './project.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    dirs: PROJECT_PATHS.sourceArray,
  },
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
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
