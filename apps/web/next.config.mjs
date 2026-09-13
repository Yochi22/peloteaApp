/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Los paquetes del monorepo se transpilan desde el workspace.
  transpilePackages: ['@pelotea/ui', '@pelotea/shared', '@pelotea/security', '@pelotea/db'],
  // Binarios nativos (napi-rs / Prisma): nunca intentar que webpack los
  // "parsee" como JS — se resuelven con require() normal en el server de
  // Node en runtime. @node-rs/argon2 publica un paquete distinto por
  // plataforma; hay que listarlos todos (agregar el del SO de producción
  // si difiere, p.ej. al desplegar en un VPS Linux con Dokploy/Coolify).
  serverExternalPackages: [
    '@node-rs/argon2',
    '@node-rs/argon2-win32-x64-msvc',
    '@node-rs/argon2-linux-x64-gnu',
    '@node-rs/argon2-linux-x64-musl',
    '@node-rs/argon2-darwin-x64',
    '@node-rs/argon2-darwin-arm64',
    '@prisma/client',
    '@prisma/engines',
  ],
  experimental: {
    // Limita el tamaño de body en Server Actions (anti-DoS de payloads grandes).
    serverActions: { bodySizeLimit: '1mb' },
  },
  eslint: { ignoreDuringBuilds: true },
  images: {
    // Solo el bucket de MinIO/S3 sirve imágenes remotas (URLs firmadas).
    remotePatterns: process.env.S3_PUBLIC_HOST
      ? [{ protocol: 'https', hostname: process.env.S3_PUBLIC_HOST }]
      : [],
  },
  // `serverExternalPackages` no bastó para que webpack dejara en paz el
  // binario nativo de @node-rs/argon2 (napi-rs) — lo forzamos a nivel de
  // webpack: nunca "parsearlo", solo require() en runtime de Node.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externos = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean);
      config.externals = [...externos, { '@node-rs/argon2': 'commonjs @node-rs/argon2' }];
    }
    return config;
  },
};

export default nextConfig;
