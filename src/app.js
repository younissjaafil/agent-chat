const express = require("express");
const cors = require("cors");
const { pool } = require("./utils/database");
const { ToolRegistry } = require("./services/toolRegistry");

// Import routes
const chatRoutes = require("./routes/chat");
const dataRoutes = require("./routes/data");
const chaiRoutes = require("./routes/chai");
const voiceRoutes = require("./routes/voice");
const historyRoutes = require("./routes/history");
const trainingRoutes = require("./routes/training");
const agentsRoutes = require("./routes/agents");

const app = express();

// CORS configuration - allow all origins for Railway
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsing middleware - MUST come before routes
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware for debugging Railway issues
app.use((req, res, next) => {
  console.log(
    `🌐 ${req.method} ${req.path} - Content-Type: ${
      req.headers["content-type"] || "none"
    }`
  );
  if (req.method === "POST" || req.method === "PUT") {
    console.log(`📦 Body keys: ${Object.keys(req.body).join(", ") || "empty"}`);
  }
  next();
});

// Initialize tool registry for testing
const toolRegistry = new ToolRegistry();

// Test database connection on startup
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
  } else {
    console.log("✅ Database connected successfully");
  }
});

// Routes
app.use("/api/chat", chatRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/agents", agentsRoutes);
app.use("/v1/chai", chaiRoutes);
app.use("/train", trainingRoutes);

// Direct endpoints as requested
app.use("/chat", chatRoutes);
app.use("/voice", voiceRoutes);
app.use("/agents", agentsRoutes);
app.use("/getHistory", historyRoutes);

app.get("/status", (req, res) =>
  res.json({
    service: "Chat Agent Microservice",
    status: "Microservice is running successfully",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  })
);

// Test tool registry endpoint
// app.post("/test-tools", async (req, res) => {
//   try {
//     const { query } = req.body;

//     if (!query) {
//       return res.status(400).json({
//         success: false,
//         error: "Query is required",
//       });
//     }

//     console.log("🛠️ Testing tool registry with query:", query);

//     // Mock instance for testing
//     const mockInstance = {
//       personality_name: "TestBot",
//       tone: "friendly",
//       trait_array: ["helpful", "tech-savvy"],
//     };

//     const result = await toolRegistry.processQuery(query, mockInstance);

//     res.json({
//       success: true,
//       query: query,
//       toolResult: result,
//       timestamp: new Date().toISOString(),
//     });
//   } catch (error) {
//     console.error("Tool test error:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

module.exports = app;
