import { Pool } from "pg";

export const connectDB = () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production"
    });

    return pool.query("SELECT 1")
        .then(() => console.log("✅ Connected to Neon.tech"))
        .catch(err => {
            console.error("❌ Database connection failed:", err);
            process.exit(1);
        });
};