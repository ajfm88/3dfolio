import mongoose from "mongoose";

// Ported from chat/backend/src/lib/db.js. Connects the shared server to the one
// MongoDB Atlas database that both /blog (posts, comments) and /chat (messages)
// plus the shared `users` collection live in.
export async function connectDB() {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("MONGO_URI is required");
    }

    const conn = await mongoose.connect(mongoUri);

    console.log("MongoDB connected:", conn.connection.host);
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1); // 1 = failed
  }
}
