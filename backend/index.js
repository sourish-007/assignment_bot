import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./src/db/connection.js";
import queryController from "./src/controllers/query.controllers.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT;

app.use(cors({
    origin: "http://localhost:5173", 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

app.use(express.json({ limit: "16kb" }));

app.use("/query", queryController);

app.use((err, req, res, next) => {
    console.error("Error:", err.message);
    res.status(err.statusCode || 500).json({
        success: false,
        error: process.env.NODE_ENV === "production" 
            ? "Internal server error" 
            : err.message
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port: ${PORT}`);
    connectDB();
});