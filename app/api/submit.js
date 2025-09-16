import { uploadToS3 } from "@/utils/s3";
import clientPromise from "@/lib/mongodb";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { plate, depths, imageBase64 } = req.body;

    const imageUrl = await uploadToS3(imageBase64, plate);

    const client = await clientPromise;
    const db = client.db("tirepro");
    await db.collection("tires").insertOne({
      plate,
      depths,
      imageUrl,
      createdAt: new Date(),
    });

    return res.status(200).json({ success: true, imageUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong" });
  }
}
