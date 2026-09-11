import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let _s3Client: S3Client | null = null;
let _bucketName: string | null = null;
let _publicUrl: string | null = null;

function getR2Client(): S3Client {
  if (!_s3Client) {
    const accountId = getRequiredEnv("R2_ACCOUNT_ID");
    const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
    _s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return _s3Client;
}

function getBucketName(): string {
  if (!_bucketName) {
    _bucketName = getRequiredEnv("R2_BUCKET_NAME");
  }
  return _bucketName;
}

function getPublicUrlBase(): string {
  if (!_publicUrl) {
    _publicUrl = getRequiredEnv("R2_PUBLIC_URL");
  }
  return _publicUrl;
}

/** 生成预签名上传 URL，有效期 10 分钟 */
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(getR2Client(), command, { expiresIn: 600 });
}

/** 上传 Buffer 到 R2 */
export async function uploadBuffer(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  options?: { metadata?: Record<string,string>; signal?: AbortSignal }
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: options?.metadata,
  });

  await getR2Client().send(command, { abortSignal: options?.signal });
}

/** 拼接公共访问 URL */
export function getPublicUrl(key: string): string {
  const base = getPublicUrlBase().endsWith("/")
    ? getPublicUrlBase().slice(0, -1)
    : getPublicUrlBase();
  return `${base}/${key}`;
}

export async function headObject(key:string,signal?:AbortSignal) {
 try { const result=await getR2Client().send(new HeadObjectCommand({Bucket:getBucketName(),Key:key}),{abortSignal:signal});return {metadata:result.Metadata??{},contentType:result.ContentType,size:result.ContentLength}; } catch(error) { if(error instanceof Error && (error.name==='NotFound'||error.name==='NoSuchKey'))return null;throw error; }
}
