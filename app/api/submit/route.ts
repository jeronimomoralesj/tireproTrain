import clientPromise from "@/lib/mongodb";
import nodemailer from "nodemailer";

type TirePayload = {
  plate: string;
  tires: {
    keys: string[]; // S3 keys for each tire's images
    depths: string[];
  }[];
};

export async function POST(req: Request) {
  try {
    const body: TirePayload = await req.json();
    const { plate, tires } = body;

    // Get client IP
    const forwardedFor = req.headers.get("x-forwarded-for");
    const nodeReq = req as Request & { socket?: any; ip?: string };
    const realIp = forwardedFor
      ? forwardedFor.split(",")[0].trim()
      : nodeReq.socket?.remoteAddress || nodeReq.ip || "Unknown";
    const ip = realIp === "::1" ? "127.0.0.1" : realIp;

    // Prepare MongoDB documents
    const docs = tires.map((tire) => ({
      plate,
      images: tire.keys.map(
        (key) => `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
      ),
      depths: tire.depths.map(Number),
      ip,
      createdAt: new Date(),
    }));

    // Save to MongoDB
    const client = await clientPromise;
    const db = client.db("tirepro-model");
    const collection = db.collection("tires");
    await collection.insertMany(docs);

    // Check if low-depth alert is needed
    const hasLowDepth = tires.some((tire) => tire.depths.some((d) => Number(d) <= 5));
    if (hasLowDepth) {
      await sendLowDepthEmail(plate, docs);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Error saving tires:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), { status: 500 });
  }
}

async function sendLowDepthEmail(
  plate: string,
  tires: { images: string[]; depths: number[] }[]
) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const tableRows = tires
    .map(
      (t, i) => `
      <tr>
        <td style="padding: 6px; border: 1px solid #ddd;">Llanta ${i + 1}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">${t.depths.join(" mm, ")} mm</td>
        <td style="padding: 6px; border: 1px solid #ddd;">
          ${t.images
            .map((img) => `<a href="${img}" target="_blank">Ver Imagen</a>`)
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
}
