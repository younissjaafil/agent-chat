const express = require("express");
const router = express.Router();
const multer = require("multer");
const TrainingService = require("../services/trainingService");

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept PDF, text, docx, audio, and video files
    const allowedTypes = /pdf|txt|doc|docx|mp3|mp4|wav|m4a|avi|mov/;
    const extname = allowedTypes.test(
      file.originalname.toLowerCase().split(".").pop()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname || mimetype) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only PDF, text, documents, audio, and video files are allowed."
        )
      );
    }
  },
});

// Initialize training service
const trainingService = new TrainingService();

/**
 * POST /train/upload
 * Upload a document to train an agent's knowledge base
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { agent_id, agentId, chunkSize, overlap } = req.body;

    // Support both agent_id and agentId parameter names
    const finalAgentId = agent_id || agentId;

    if (!finalAgentId) {
      return res.status(400).json({
        success: false,
        error: "agent_id or agentId is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    console.log(`📤 Uploading document for agent: ${finalAgentId}`);
    console.log(`📄 File: ${req.file.originalname}`);

    // Fix chunking: Default to 1000 chars per chunk, 200 overlap
    // This prevents 202 tiny chunks (avg 22 chars) and creates proper 5-15 chunks
    const options = {
      chunkSize: chunkSize ? parseInt(chunkSize) : 1000,
      overlap: overlap ? parseInt(overlap) : 200,
    };

    console.log(
      `⚙️ Chunking config: chunkSize=${options.chunkSize}, overlap=${options.overlap}`
    );

    const result = await trainingService.uploadDocument(
      finalAgentId,
      req.file.buffer,
      req.file.originalname,
      options
    );

    if (result.success) {
      res.status(201).json({
        success: true,
        message: "Document uploaded and processed successfully",
        data: {
          documentId: result.documentId,
          document: result.document,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || "Failed to upload document",
        details: result.details,
      });
    }
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /train/debug/search
 * Debug endpoint: Return raw vector matches with full metadata
 * Use this to verify retrieval works before checking chat integration
 */
router.post("/debug/search", async (req, res) => {
  try {
    const { agent_id, agentId, query, topK = 5, threshold = 0.5 } = req.body;

    const finalAgentId = agent_id || agentId;

    if (!finalAgentId) {
      return res.status(400).json({
        success: false,
        error: "agent_id or agentId is required",
      });
    }

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "query is required",
      });
    }

    console.log(`🔍 [DEBUG] Searching for agent: ${finalAgentId}`);
    console.log(`🔍 [DEBUG] Query: "${query}"`);
    console.log(`🔍 [DEBUG] TopK: ${topK}, Threshold: ${threshold}`);

    const result = await trainingService.searchKnowledgeBase(
      finalAgentId,
      query,
      {
        limit: parseInt(topK),
        threshold: parseFloat(threshold),
      }
    );

    // Return raw matches with full debug info
    const debugResponse = {
      success: result.success,
      query: query,
      agentId: finalAgentId,
      topK: parseInt(topK),
      threshold: parseFloat(threshold),
      matchesFound: result.resultsCount || 0,
      matches: (result.results || []).map((match, idx) => ({
        rank: idx + 1,
        score: match.score,
        scorePercentage: (match.score * 100).toFixed(1) + "%",
        text: match.chunk || "",
        textPreview: (match.chunk || "").substring(0, 200) + "...",
        metadata: {
          agentId: finalAgentId,
          documentId: match.documentId,
          documentName: match.document?.name,
          documentType: match.document?.type,
        },
      })),
      avgScore:
        result.results?.length > 0
          ? (
              result.results.reduce((sum, r) => sum + r.score, 0) /
              result.results.length
            ).toFixed(3)
          : 0,
      interpretation:
        result.results?.length > 0
          ? result.results[0].score >= 0.7
            ? "EXCELLENT MATCH"
            : result.results[0].score >= 0.6
            ? "GOOD MATCH"
            : result.results[0].score >= 0.5
            ? "MODERATE MATCH"
            : "WEAK MATCH"
          : "NO MATCHES",
      error: result.error || null,
    };

    console.log(
      `✅ [DEBUG] Found ${debugResponse.matchesFound} matches with avg score ${debugResponse.avgScore}`
    );

    res.json(debugResponse);
  } catch (error) {
    console.error("❌ [DEBUG] Search error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * POST /train/search
 * Search an agent's knowledge base
 */
router.post("/search", async (req, res) => {
  try {
    const {
      agent_id,
      agentId,
      query,
      limit = 10,
      threshold = 0.7,
      documentTypes,
    } = req.body;

    // Support both agent_id and agentId parameter names
    const finalAgentId = agent_id || agentId;

    if (!finalAgentId) {
      return res.status(400).json({
        success: false,
        error: "agent_id or agentId is required",
      });
    }

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "query is required",
      });
    }

    console.log(`🔍 Searching knowledge base for agent: ${finalAgentId}`);

    const result = await trainingService.searchKnowledgeBase(
      finalAgentId,
      query,
      {
        limit: parseInt(limit),
        threshold: parseFloat(threshold),
        documentTypes: documentTypes,
      }
    );

    if (result.success) {
      res.json({
        success: true,
        query: query,
        resultsCount: result.resultsCount,
        results: result.results,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error || "No results found",
        query: query,
        resultsCount: 0,
        results: [],
      });
    }
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /train/documents
 * List all documents for an agent
 */
router.get("/documents", async (req, res) => {
  try {
    const {
      agent_id,
      agentId,
      type,
      search,
      offset = 0,
      limit = 20,
    } = req.query;

    // Support both agent_id and agentId parameter names
    const finalAgentId = agent_id || agentId;

    if (!finalAgentId) {
      return res.status(400).json({
        success: false,
        error: "agent_id or agentId is required",
      });
    }

    console.log(`📚 Listing documents for agent: ${finalAgentId}`);

    const result = await trainingService.listDocuments(finalAgentId, {
      type: type,
      search: search,
      offset: parseInt(offset),
      limit: parseInt(limit),
    });

    if (result.success) {
      res.json({
        success: true,
        documents: result.documents,
        pagination: result.pagination,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error || "Failed to list documents",
        documents: [],
      });
    }
  } catch (error) {
    console.error("List documents error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /train/stats
 * Get statistics for an agent's knowledge base
 */
router.get("/stats", async (req, res) => {
  try {
    const { agent_id, agentId } = req.query;

    // Support both agent_id and agentId parameter names
    const finalAgentId = agent_id || agentId;

    if (!finalAgentId) {
      return res.status(400).json({
        success: false,
        error: "agent_id or agentId is required",
      });
    }

    console.log(`📊 Getting statistics for agent: ${finalAgentId}`);

    const result = await trainingService.getStatistics(finalAgentId);

    if (result.success) {
      res.json({
        success: true,
        agentId: result.agentId,
        stats: result.stats,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error || "Failed to get statistics",
      });
    }
  } catch (error) {
    console.error("Get statistics error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /train/documents/:documentId
 * Delete a document from an agent's knowledge base
 */
router.delete("/documents/:documentId", async (req, res) => {
  try {
    const { documentId } = req.params;
    const { agent_id, agentId } = req.query;

    // Support both agent_id and agentId parameter names
    const finalAgentId = agent_id || agentId;

    if (!finalAgentId) {
      return res.status(400).json({
        success: false,
        error: "agent_id or agentId is required",
      });
    }

    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: "documentId is required",
      });
    }

    console.log(
      `🗑️ Deleting document ${documentId} for agent: ${finalAgentId}`
    );

    const result = await trainingService.deleteDocument(
      finalAgentId,
      documentId
    );

    if (result.success) {
      res.json({
        success: true,
        message: "Document deleted successfully",
        documentId: result.documentId,
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error || "Failed to delete document",
      });
    }
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /train/health
 * Check if training service is available
 */
router.get("/health", async (req, res) => {
  try {
    const isAvailable = await trainingService.isAvailable();

    res.json({
      success: true,
      available: isAvailable,
      service: "training-api",
      endpoint: trainingService.baseUrl,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      available: false,
      error: error.message,
    });
  }
});

module.exports = router;
