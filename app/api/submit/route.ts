import clientPromise from "@/lib/mongodb";
import nodemailer from "nodemailer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

type TirePayload = {
  plate: string;
  sendEmail?: boolean;
  tires: {
    images: (string | null)[];
    depths: string[];
  }[];
};

type TireWithS3Urls = {
  images: (string | null)[];
  depths: string[];
};

// 1️⃣ Setup AWS S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: Request) {
  try {
    const body: TirePayload = await req.json();
    const { plate, tires } = body;

    // 2️⃣ Upload each image to S3 and replace with URL
    const tiresWithS3Urls: TireWithS3Urls[] = await Promise.all(
      tires.map(async (tire, tIndex) => {
        const s3Urls = await Promise.all(
          tire.images.map(async (imgBase64, imgIndex) => {
            if (!imgBase64) return null;

            // Extract file type and data from Base64
            const [meta, base64Data] = imgBase64.split(",");
            const mimeType = meta.match(/data:(.*?);base64/)?.[1] || "image/png";
            const buffer = Buffer.from(base64Data, "base64");

            const key = `tires/${plate}/tire-${tIndex + 1}-${imgIndex + 1}-${Date.now()}.png`;

            // ✅ Upload to S3 (no ACL)
            await s3.send(
              new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME!,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
              })
            );

            return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
          })
        );

        return { ...tire, images: s3Urls };
      })
    );

    // 3️⃣ Connect to MongoDB
    const client = await clientPromise;
    const db = client.db("tirepro-model");
    const collection = db.collection("tires");

    // 4️⃣ Store each tire individually
    const docs = tiresWithS3Urls.map((tire) => ({
      plate,
      images: tire.images,
      depths: tire.depths.map(Number),
      createdAt: new Date(),
    }));

    await collection.insertMany(docs);

    // 5️⃣ Send email if at least one tire is low
    const hasLowDepth = tiresWithS3Urls.some((tire) =>
      tire.depths.some((d) => Number(d) <= 5)
    );

    if (hasLowDepth) {
      await sendLowDepthEmail(plate, tiresWithS3Urls);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error saving tires:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function sendLowDepthEmail(
  plate: string,
  tires: TireWithS3Urls[]
): Promise<void> {
  try {
    const transporter = nodemailer.createTransporter({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Build HTML table with all tires
    const tableRows = tires
      .map(
        (t, i) => `
        <tr>
          <td style="padding: 6px; border: 1px solid #ddd;">Tire ${i + 1}</td>
          <td style="padding: 6px; border: 1px solid #ddd;">${t.depths.join(" mm, ")} mm</td>
          <td style="padding: 6px; border: 1px solid #ddd;">
            ${t.images
              .map(
                (img) =>
                  img
                    ? `<a href="${img}" target="_blank">Ver Imagen</a>`
                    : "No image"
              )
              .join("<br/>")}
          </td>
        </tr>`
      )
      .join("");

    const emailBody = `
      <h2>🚨 Alerta de Profundidad Baja</h2>
      <p><b>Placa:</b> ${plate}</p>
      <table style="border-collapse: collapse; width: 100%; margin-top: 12px;">
        <thead>
          <tr style="background: #f0f0f0;">
            <th style="padding: 6px; border: 1px solid #ddd;">Llanta</th>
            <th style="padding: 6px; border: 1px solid #ddd;">Profundidades</th>
            <th style="padding: 6px; border: 1px solid #ddd;">Imágenes</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      <p style="margin-top: 16px; font-size: 12px; color: #555;">
        ⚠️ Esta alerta se genera porque al menos una de las profundidades es ≤ 5 mm.
      </p>
    `;

    await transporter.sendMail({
      from: `"TirePro Alerts" <${process.env.EMAIL_USER}>`,
      to: "moraljero1234567890@gmail.com",
      subject: `🚨 Alerta de Profundidad Baja — Placa ${plate}`,
      html: emailBody,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    // Don't throw error here to prevent API failure if email fails
  }
}