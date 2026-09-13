import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Cliente S3 apuntando a MinIO. Los comprobantes NUNCA se sirven directo del
 * bucket: siempre por URL firmada de corta duración (ver SECURITY.md §2.8).
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

export async function subirComprobante(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Nunca inline: fuerza descarga aunque alguien abra la URL firmada directo.
      ContentDisposition: 'attachment',
      Metadata: { 'uploaded-by': 'pelotea-web' },
    }),
  );
}

/** URL firmada de solo lectura, corta duración (default 5 min). */
export async function urlFirmadaComprobante(key: string, expiresInSec = 300): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: expiresInSec });
}
