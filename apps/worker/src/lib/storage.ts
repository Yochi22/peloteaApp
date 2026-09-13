import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Cliente S3 mínimo — el worker solo BORRA comprobantes viejos, nunca sube
 * ni lee (eso lo hace la web, ver apps/web/src/lib/storage.ts). Mismas
 * credenciales/bucket, así que las variables de entorno son las mismas.
 */
const s3 = new S3Client({
  region: process.env.S3_REGION ?? 'us-east-1',
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
});

const BUCKET = process.env.S3_BUCKET ?? 'pelotea-comprobantes';

export async function borrarComprobante(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
