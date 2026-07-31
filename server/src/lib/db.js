import mongoose from "mongoose";

// Connects the shared server to the one MongoDB Atlas database that both /blog
// (posts, comments) and /chat (messages) plus the shared `users` collection live
// in.
export async function connectDB() {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("MONGO_URI is required");
    }

    const conn = await mongoose.connect(mongoUri);

    // The database name is logged alongside the host because it is the one part
    // of the connection the URI can omit: with no path segment before the query
    // string the driver quietly opens a database called `test`, which looks
    // identical in every other respect. Printing it makes that visible at boot
    // instead of on the day someone goes looking for the data.
    console.log("MongoDB connected:", conn.connection.host, "/", conn.connection.name);
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1); // 1 = failed
  }
}
