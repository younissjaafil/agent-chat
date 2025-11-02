require("dotenv").config();
const axios = require("axios");
const FormData = require("form-data");

/**
 * TrainingService - Integrates with the Train Agent API (https://train-agent.vercel.app)
 * Handles document uploads, searches, and management using agent_id instead of user_id
 */
class TrainingService {
  constructor() {
    this.baseUrl =
      process.env.TRAIN_API_URL || "https://train-agent.vercel.app";
    this.timeout = 30000; // 30 seconds for training operations
  }

  /**
   * Upload a document to train an agent's knowledge base
   * @param {string} agentId - Agent UUID or ID
   * @param {Buffer|Stream} fileBuffer - File buffer or stream
   * @param {string} fileName - Original filename
   * @param {Object} options - Optional parameters (chunkSize, overlap)
   * @returns {Promise<Object>} Upload result
   */
  async uploadDocument(agentId, fileBuffer, fileName, options = {}) {
    try {
      console.log(`📤 Uploading document for agent: ${agentId}`);

      const formData = new FormData();
      formData.append("agent_id", agentId);
      formData.append("file", fileBuffer, fileName);

      if (options.chunkSize) {
        formData.append("chunkSize", options.chunkSize.toString());
      }
      if (options.overlap) {
        formData.append("overlap", options.overlap.toString());
      }

      const response = await axios.post(`${this.baseUrl}/train`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: this.timeout,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      if (response.data && response.data.success) {
        console.log(
          `✅ Document uploaded successfully: ${response.data.data?.document?.name}`
        );
        return {
          success: true,
          documentId: response.data.data?.documentId,
          document: response.data.data?.document,
          message: response.data.message,
        };
      }

      throw new Error(
        response.data?.error || "Failed to upload document to training API"
      );
    } catch (error) {
      console.error("❌ Document upload error:", error.message);
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
      };
    }
  }

  /**
   * Search an agent's knowledge base
   * @param {string} agentId - Agent UUID or ID
   * @param {string} query - Search query
   * @param {Object} options - Search options (limit, threshold, documentTypes)
   * @returns {Promise<Object>} Search results
   */
  async searchKnowledgeBase(agentId, query, options = {}) {
    try {
      console.log(`🔍 Searching knowledge base for agent: ${agentId}`);
      console.log(`📝 Query: "${query}"`);

      const searchPayload = {
        agent_id: agentId,
        query: query,
        limit: options.limit || 10,
        threshold: options.threshold || 0.7,
      };

      if (options.documentTypes && Array.isArray(options.documentTypes)) {
        searchPayload.documentTypes = options.documentTypes;
      }

      const response = await axios.post(
        `${this.baseUrl}/train/search`,
        searchPayload,
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: this.timeout,
        }
      );

      if (response.data && response.data.success) {
        console.log(
          `✅ Found ${
            response.data.resultsCount || 0
          } results for agent ${agentId}`
        );
        return {
          success: true,
          results: response.data.results || [],
          resultsCount: response.data.resultsCount || 0,
          query: response.data.query,
        };
      }

      return {
        success: false,
        results: [],
        resultsCount: 0,
        error: response.data?.error || "No results found",
      };
    } catch (error) {
      console.error("❌ Knowledge base search error:", error.message);
      return {
        success: false,
        results: [],
        resultsCount: 0,
        error: error.message,
        details: error.response?.data,
      };
    }
  }

  /**
   * List all documents for an agent
   * @param {string} agentId - Agent UUID or ID
   * @param {Object} options - List options (type, search, offset, limit)
   * @returns {Promise<Object>} List of documents
   */
  async listDocuments(agentId, options = {}) {
    try {
      console.log(`📚 Listing documents for agent: ${agentId}`);

      const params = new URLSearchParams({
        agent_id: agentId,
      });

      if (options.type) params.append("type", options.type);
      if (options.search) params.append("search", options.search);
      if (options.offset) params.append("offset", options.offset.toString());
      if (options.limit) params.append("limit", options.limit.toString());

      const response = await axios.get(
        `${this.baseUrl}/train/documents?${params.toString()}`,
        {
          timeout: this.timeout,
        }
      );

      if (response.data && response.data.success) {
        console.log(
          `✅ Found ${response.data.documents?.length || 0} documents`
        );
        return {
          success: true,
          documents: response.data.documents || [],
          pagination: response.data.pagination,
        };
      }

      return {
        success: false,
        documents: [],
        error: response.data?.error || "Failed to list documents",
      };
    } catch (error) {
      console.error("❌ List documents error:", error.message);
      return {
        success: false,
        documents: [],
        error: error.message,
        details: error.response?.data,
      };
    }
  }

  /**
   * Get statistics for an agent's knowledge base
   * @param {string} agentId - Agent UUID or ID
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics(agentId) {
    try {
      console.log(`📊 Getting statistics for agent: ${agentId}`);

      const response = await axios.get(
        `${this.baseUrl}/train/stats?agent_id=${agentId}`,
        {
          timeout: this.timeout,
        }
      );

      if (response.data && response.data.success) {
        console.log(`✅ Retrieved statistics for agent ${agentId}`);
        return {
          success: true,
          agentId: response.data.agentId,
          stats: response.data.stats,
        };
      }

      return {
        success: false,
        error: response.data?.error || "Failed to get statistics",
      };
    } catch (error) {
      console.error("❌ Get statistics error:", error.message);
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
      };
    }
  }

  /**
   * Delete a document from an agent's knowledge base
   * @param {string} agentId - Agent UUID or ID
   * @param {string} documentId - Document ID to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deleteDocument(agentId, documentId) {
    try {
      console.log(`🗑️ Deleting document ${documentId} for agent: ${agentId}`);

      const response = await axios.delete(
        `${this.baseUrl}/train/documents/${documentId}?agent_id=${agentId}`,
        {
          timeout: this.timeout,
        }
      );

      if (response.data && response.data.success) {
        console.log(`✅ Document deleted successfully: ${documentId}`);
        return {
          success: true,
          message: response.data.message,
          documentId: response.data.documentId,
        };
      }

      return {
        success: false,
        error: response.data?.error || "Failed to delete document",
      };
    } catch (error) {
      console.error("❌ Delete document error:", error.message);
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
      };
    }
  }

  /**
   * Format search results for AI consumption
   * @param {Array} results - Search results from the API
   * @returns {string} Formatted text for AI context
   */
  formatResultsForAI(results) {
    if (!results || results.length === 0) {
      return "";
    }

    let formattedText = `Found ${results.length} relevant document(s) from knowledge base:\n\n`;

    results.forEach((result, index) => {
      const score = (result.score * 100).toFixed(1);
      const docName = result.document?.name || "Unknown document";
      const docType = result.document?.type || "unknown";
      const chunk = result.chunk || "";

      formattedText += `📄 Document ${index + 1}: ${docName}\n`;
      formattedText += `📊 Relevance: ${score}%\n`;
      formattedText += `📁 Type: ${docType}\n`;
      formattedText += `📝 Content: ${chunk}\n`;
      formattedText += `${"=".repeat(50)}\n\n`;
    });

    return formattedText;
  }

  /**
   * Check if training service is available
   * @returns {Promise<boolean>} Service availability
   */
  async isAvailable() {
    try {
      const response = await axios.get(this.baseUrl, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      console.error("Training service unavailable:", error.message);
      return false;
    }
  }
}

module.exports = TrainingService;
