import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET() {
  const client = await clientPromise;
  const db = client.db("tirepro-model");
  const collection = db.collection("tires");

  const docs = await collection.find().sort({ createdAt: -1 }).toArray();
  return new Response(JSON.stringify(docs), { status: 200 });
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing ID" }),
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("tirepro-model");
    const collection = db.collection("tires");

    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) {
      return new Response(
        JSON.stringify({ success: false, error: "Inspection not found" }),
        { status: 404 }
      );
    }

    // Just delete the DB record — no S3 deletion
    await collection.deleteOne({ _id: new ObjectId(id) });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("Delete error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500 }
    );
  }
}
