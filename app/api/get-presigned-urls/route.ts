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

    // Validate inputs
    if (!plate || !files || files.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing plate or files" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (files.length > 60) { // Max 20 tires * 3 images each
      return new Response(
        JSON.stringify({ success: false, error: "Too many files. Maximum 60 files allowed." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate file types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const invalidFiles = files.filter(file => !allowedTypes.includes(file.type.toLowerCase()));
    
    if (invalidFiles.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid file types found. Only JPEG, PNG, and WebP images are allowed.` 
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate pre-signed URLs in batches for better performance
    const batchSize = 10;
    const urlPromises = [];

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (file, batchIndex) => {
        const globalIndex = i + batchIndex;
        
        // Create unique key with timestamp and sanitized filename
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const key = `tires/${plate}/${timestamp}-${globalIndex + 1}-${sanitizedName}`;
        
        const command = new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME!,
          Key: key,
          ContentType: file.type,
          // Add metadata for better organization
          Metadata: {
            'original-name': file.name,
            'plate': plate,
            'upload-time': new Date().toISOString(),
            'file-index': String(globalIndex + 1)
          }
        });

        const uploadUrl = await getSignedUrl(s3, command, { 
          expiresIn: 600 // 10 minutes for large uploads
        });
        
        return { uploadUrl, key, originalName: file.name, index: globalIndex };
      });

      urlPromises.push(...batchPromises);
    }

    // Execute all URL generation promises
    const urls = await Promise.all(urlPromises);

    console.log(`Generated ${urls.length} pre-signed URLs for plate ${plate}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        urls,
        message: `Generated ${urls.length} pre-signed URLs`,
        expiresIn: 600 // Let frontend know expiration time
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error generating pre-signed URLs:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to generate pre-signed URLs"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}