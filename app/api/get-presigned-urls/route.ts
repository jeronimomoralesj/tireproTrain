import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: Request) {
  try {
    const { plate, files }: { plate: string; files: { name: string; type: string }[] } =
      await req.json();

    const urls = await Promise.all(
      files.map(async (file, index) => {
        const key = `tires/${plate}/tire-${index + 1}-${Date.now()}-${file.name}`;
        const command = new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME!,
          Key: key,
          ContentType: file.type,
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min
        return { uploadUrl, key };
      })
    );

    return new Response(JSON.stringify({ success: true, urls }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
