import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function uploadImageToS3(base64: string, key: string) {
  // Convert base64 to Buffer
  const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64");

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: "image/jpeg", // or detect dynamically
      // ❌ Do NOT include ACL here
    })
  );

  // Return public URL (if your bucket is public) or signed URL if private
  return `https://${process.env.AWS_BUCKET_NAME!}.s3.${process.env.AWS_REGION!}.amazonaws.com/${key}`;
}
