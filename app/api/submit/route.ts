import clientPromise from "@/lib/mongodb";
import * as nodemailer from "nodemailer";
import type { Socket } from "net";

type TirePayload = {
  plate: string;
  tires: {
    keys: string[]; // S3 keys for each tire's images
    depths: string[];
    position: string; // New field for tire position
  }[];
};

export async function POST(req: Request) {
  try {
    // Parse and validate request body
    let body: TirePayload;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { plate, tires } = body;
    console.log("Received data:", { plate, tiresCount: tires?.length });

    // Validate required fields
    if (!plate || !tires || !Array.isArray(tires) || tires.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: plate and tires array" }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate each tire has required fields
    const invalidTires = tires.filter(tire => 
      !tire.position?.trim() || 
      !Array.isArray(tire.keys) || 
      !Array.isArray(tire.depths) ||
      tire.keys.length === 0
    );
    
    if (invalidTires.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid tire data found. Each tire must have position, keys array, and depths array.` 
        }), 
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get client IP
    const forwardedFor = req.headers.get("x-forwarded-for");
    const nodeReq = req as Request & { socket?: Socket; ip?: string };
    const realIp = forwardedFor
      ? forwardedFor.split(",")[0].trim()
      : nodeReq.socket?.remoteAddress || nodeReq.ip || "Unknown";
    const ip = realIp === "::1" ? "127.0.0.1" : realIp;

    // Prepare MongoDB documents with position
    const docs = tires.map((tire, index) => {
      // Ensure we have valid image URLs
      const imageUrls = tire.keys
        .filter(key => key && key.trim())
        .map(key => `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`);

      // Process depths - handle empty strings and invalid numbers
      const processedDepths = tire.depths
        .map(d => {
          if (typeof d === 'string') d = d.trim();
          if (d === '' || d === null || d === undefined) return 0;
          const num = Number(d);
          return isNaN(num) ? 0 : Math.max(0, num); // Ensure non-negative
        });

      return {
        plate: plate.trim(),
        position: tire.position.trim(),
        images: imageUrls,
        depths: processedDepths,
        ip,
        createdAt: new Date(),
        tireIndex: index + 1,
      };
    });

    // Save to MongoDB with error handling
    let client;
    let insertResult;
    
    try {
      client = await clientPromise;
      const db = client.db("tirepro-model");
      const collection = db.collection("tires");
      
      console.log(`Attempting to insert ${docs.length} documents for plate ${plate}`);
      insertResult = await collection.insertMany(docs);
      
      if (!insertResult.acknowledged) {
        throw new Error("MongoDB insert was not acknowledged");
      }
      
      console.log(`Successfully inserted ${insertResult.insertedCount} documents`);
    } catch (dbError) {
      console.error("MongoDB error:", dbError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Database error: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if low-depth alert is needed (asynchronously)
    const hasLowDepth = tires.some((tire) => 
      tire.depths.some((d) => {
        const depth = Number(d);
        return !isNaN(depth) && depth <= 5;
      })
    );
    
    if (hasLowDepth) {
      // Send email asynchronously to avoid blocking the response
      sendLowDepthEmail(plate, docs).catch(error => {
        console.error("Error sending low depth email:", error);
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully saved ${docs.length} tire inspections for plate ${plate}`,
        tiresProcessed: docs.length
      }), 
      { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Error saving tires:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }), 
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

async function sendLowDepthEmail(
  plate: string,
  tires: { position: string; images: string[]; depths: number[]; tireIndex: number }[]
) {
  try {
    // Validate environment variables first
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("Email credentials not configured. Skipping email notification.");
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Only include tires with low depth in the email
    const lowDepthTires = tires.filter(tire => 
      tire.depths.some(depth => depth <= 5)
    );

    const tableRows = lowDepthTires
      .map(
        (t) => `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">
            Llanta ${t.tireIndex} - ${t.position}
          </td>
          <td style="padding: 8px; border: 1px solid #ddd;">
            ${t.depths.map(d => `${d} mm`).join(", ")}
          </td>
          <td style="padding: 8px; border: 1px solid #ddd;">
            ${t.images
              .map((img, idx) => {
                const labels = ["Interna", "Centro", "Externa"];
                return `<a href="${img}" target="_blank" style="color: #0066cc; text-decoration: none;">${labels[idx]}</a>`;
              })
              .join(" | ")}
          </td>
        </tr>`
      )
      .join("");

    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <h2 style="color: #dc3545; border-bottom: 2px solid #dc3545; padding-bottom: 10px;">
          🚨 Alerta de Profundidad Baja
        </h2>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Placa del Vehículo:</strong> ${plate}</p>
          <p style="margin: 5px 0 0 0;"><strong>Número de llantas con alerta:</strong> ${lowDepthTires.length}</p>
          <p style="margin: 5px 0 0 0;"><strong>Fecha de inspección:</strong> ${new Date().toLocaleString('es-CO')}</p>
        </div>
        
        <table style="border-collapse: collapse; width: 100%; margin-top: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <thead>
            <tr style="background: #dc3545; color: white;">
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Llanta y Posición</th>
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Profundidades</th>
              <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Imágenes</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        
        <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin-top: 20px;">
          <p style="margin: 0; color: #856404;">
            ⚠️ <strong>Criterio de Alerta:</strong> Esta alerta se genera automáticamente cuando al menos una de las profundidades es ≤ 5 mm.
          </p>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #6c757d;">
          <p style="margin: 0;">Sistema TirePro - Monitoreo Automático de Llantas</p>
          <p style="margin: 5px 0 0 0;">Generado automáticamente el ${new Date().toLocaleString('es-CO')}</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"TirePro Alerts" <${process.env.EMAIL_USER}>`,
      to: "moraljero1234567890@gmail.com",
      subject: `🚨 URGENTE: ${lowDepthTires.length} Llanta(s) con Profundidad Crítica — Placa ${plate}`,
      html: emailBody,
    });

    console.log(`Low depth alert email sent successfully for plate ${plate}`);
  } catch (error) {
    console.error("Failed to send low depth email:", error);
    throw error;
  }
}