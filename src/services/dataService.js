const { pool } = require("../utils/database");
const EncryptionService = require("../utils/encryption");

class DataService {
  constructor() {
    this.encryptionService = new EncryptionService();
  }

  // Get static instance for encryption service
  static getEncryptionService() {
    if (!DataService.encryptionInstance) {
      DataService.encryptionInstance = new EncryptionService();
    }
    return DataService.encryptionInstance;
  }

  // === AGENT METHODS (Simplified - Direct Agent Access) ===

  // Get agent by ID (from agents table)
  static async getAgentById(agentId) {
    try {
      // Check if agentId is a UUID (contains dashes) or an integer
      const isUUID = typeof agentId === "string" && agentId.includes("-");

      let query, params;
      if (isUUID) {
        // Search by agent_id (UUID column)
        query = "SELECT * FROM agents WHERE agent_id = $1";
        params = [agentId];
      } else {
        // Search by id (integer column) - convert to integer
        query = "SELECT * FROM agents WHERE id = $1";
        params = [parseInt(agentId)];
      }

      const result = await pool.query(query, params);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting agent:", error);
      throw error;
    }
  }

  // Get all agents
  static async getAllAgents() {
    try {
      const result = await pool.query(
        "SELECT * FROM agents WHERE is_active = true ORDER BY name"
      );
      return result.rows;
    } catch (error) {
      console.error("Error getting agents:", error);
      throw error;
    }
  }

  // === PERSONALITY METHODS (Legacy Support) ===

  // Get personality data by ID
  static async getPersonalityById(personalityId) {
    try {
      const result = await pool.query(
        "SELECT * FROM personality WHERE id = $1",
        [personalityId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting personality:", error);
      throw error;
    }
  }

  // Get personality data by asid
  static async getPersonalityByAsid(asid) {
    try {
      const result = await pool.query(
        "SELECT * FROM personality WHERE asid = $1",
        [asid]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting personality by asid:", error);
      throw error;
    }
  }

  // Get all personalities
  static async getAllPersonalities() {
    try {
      const result = await pool.query(
        "SELECT * FROM personality ORDER BY name"
      );
      return result.rows;
    } catch (error) {
      console.error("Error getting personalities:", error);
      throw error;
    }
  }

  // Get instance data by ID
  static async getInstanceById(instanceId) {
    try {
      const result = await pool.query("SELECT * FROM instances WHERE id = $1", [
        instanceId,
      ]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting instance:", error);
      throw error;
    }
  }

  // Get instance data by asid
  static async getInstanceByAsid(asid) {
    try {
      const result = await pool.query(
        "SELECT * FROM instances WHERE asid = $1",
        [asid]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting instance by asid:", error);
      throw error;
    }
  }

  // Get instances for a user
  static async getInstancesByUserId(userId) {
    try {
      const result = await pool.query(
        "SELECT * FROM instances WHERE userid = $1 ORDER BY created_at DESC",
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error("Error getting user instances:", error);
      throw error;
    }
  }

  // Get instance with personality data (using asid to link)
  static async getInstanceWithPersonality(asid) {
    try {
      const result = await pool.query(
        `SELECT 
          i.*,
          p.name as personality_name,
          p.trait_array,
          p.tone,
          p.asid as personality_asid
         FROM instances i
         LEFT JOIN personality p ON i.asid = p.asid
         WHERE i.asid = $1`,
        [asid]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting instance with personality:", error);
      throw error;
    }
  }

  // Get all instances with personality data for a user
  static async getUserInstancesWithPersonality(userId) {
    try {
      const result = await pool.query(
        `SELECT 
          i.*,
          p.name as personality_name,
          p.trait_array,
          p.tone,
          p.asid as personality_asid
         FROM instances i
         LEFT JOIN personality p ON i.asid = p.asid
         WHERE i.userid = $1
         ORDER BY i.created_at DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error("Error getting user instances with personality:", error);
      throw error;
    }
  }

  // === CHAT HISTORY METHODS ===

  // Create chat history table if it doesn't exist
  static async createChatHistoryTable() {
    try {
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS chatHistory (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          agent_id VARCHAR(255) NOT NULL,
          text TEXT NOT NULL,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          message_type VARCHAR(50) DEFAULT 'text'
        );
        
        CREATE INDEX IF NOT EXISTS idx_chathistory_user_agent 
        ON chatHistory(user_id, agent_id);
        
        CREATE INDEX IF NOT EXISTS idx_chathistory_timestamp 
        ON chatHistory(timestamp);
      `;

      await pool.query(createTableQuery);
      console.log("✅ ChatHistory table created/verified successfully");
      return true;
    } catch (error) {
      console.error("Error creating chatHistory table:", error);
      throw error;
    }
  }

  // Store a chat message (using conversations and messages tables)
  static async storeChatMessage(param1, param2, text, messageType = "text") {
    try {
      // Determine which parameter is user and which is agent
      // User IDs are strings like "s1" or integers
      // Agent IDs are UUIDs (contain dashes)
      const param1IsAgent = typeof param1 === "string" && param1.includes("-");
      const param2IsAgent = typeof param2 === "string" && param2.includes("-");

      let userId, agentId, senderType;

      if (param1IsAgent) {
        // param1 is agent, param2 is user - this is an agent response
        agentId = param1;
        userId = param2;
        senderType = "agent";
      } else {
        // param1 is user, param2 is agent - this is a user message
        userId = param1;
        agentId = param2;
        senderType = "user";
      }

      // Convert to integer IDs
      let userIntId = userId;
      let agentIntId = agentId;

      // Look up user's integer ID from users table
      if (typeof userId === "string" && isNaN(userId)) {
        const userResult = await pool.query(
          "SELECT id FROM users WHERE user_id = $1",
          [userId]
        );
        if (userResult.rows.length === 0) {
          console.warn(
            `User ${userId} not found in users table, skipping message storage`
          );
          return null;
        }
        userIntId = userResult.rows[0].id;
      }

      // Look up agent's integer ID
      if (typeof agentId === "string" && agentId.includes("-")) {
        const agentResult = await pool.query(
          "SELECT id FROM agents WHERE agent_id = $1",
          [agentId]
        );
        if (agentResult.rows.length === 0) {
          console.warn(`Agent ${agentId} not found, skipping message storage`);
          return null;
        }
        agentIntId = agentResult.rows[0].id;
      }

      // Find or create conversation
      let conversationId;

      const existingConv = await pool.query(
        `SELECT conversation_id FROM conversations 
         WHERE user_id = $1 AND agent_id = $2 
         LIMIT 1`,
        [userIntId, agentIntId]
      );

      if (existingConv.rows.length > 0) {
        conversationId = existingConv.rows[0].conversation_id;
      } else {
        // Create new conversation
        const newConv = await pool.query(
          `INSERT INTO conversations (user_id, agent_id, title) 
           VALUES ($1, $2, $3) 
           RETURNING conversation_id`,
          [userIntId, agentIntId, "Chat Session"]
        );
        conversationId = newConv.rows[0].conversation_id;
      }

      // Store message in messages table
      const result = await pool.query(
        `INSERT INTO messages (conversation_id, sender_type, content) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [conversationId, senderType, text]
      );

      return result.rows[0];
    } catch (error) {
      console.error("Error storing chat message:", error);
      return null;
    }
  }

  // Get chat history between user and agent (using conversations and messages)
  static async getChatHistory(userId, agentId, limit = 50, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT m.*, c.user_id, c.agent_id 
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.conversation_id
         WHERE c.user_id = $1 AND c.agent_id = $2
         ORDER BY m.created_at DESC 
         LIMIT $3 OFFSET $4`,
        [userId, agentId, limit, offset]
      );

      // Format messages to match expected structure
      return result.rows.map((row) => ({
        role: row.sender_type === "user" ? "user" : "assistant",
        content: row.content,
        timestamp: row.created_at,
        isUser: row.sender_type === "user",
      }));
    } catch (error) {
      console.error("Error getting chat history:", error);
      throw error;
    }
  }

  // Get chat history for a specific user (all conversations) (with decryption)
  static async getUserChatHistory(userId, limit = 100, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT * FROM chatHistory 
         WHERE user_id = $1 OR agent_id = $1
         ORDER BY timestamp DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      // Decrypt messages before returning
      return DataService.decryptMessages(result.rows);
    } catch (error) {
      console.error("Error getting user chat history:", error);
      throw error;
    }
  }

  // Get latest messages for a conversation (using conversations and messages)
  static async getLatestMessages(userId, agentId, count = 10) {
    try {
      // Convert string IDs to integer IDs for database lookup
      let userIntId = userId;
      let agentIntId = agentId;

      // If userId is a string, look up the user's integer ID
      if (typeof userId === "string" && isNaN(userId)) {
        const userResult = await pool.query(
          "SELECT id FROM users WHERE user_id = $1",
          [userId]
        );
        if (userResult.rows.length === 0) {
          console.warn(`User ${userId} not found, returning empty history`);
          return [];
        }
        userIntId = userResult.rows[0].id;
      }

      // If agentId is a UUID, look up the agent's integer ID
      if (typeof agentId === "string" && agentId.includes("-")) {
        const agentResult = await pool.query(
          "SELECT id FROM agents WHERE agent_id = $1",
          [agentId]
        );
        if (agentResult.rows.length === 0) {
          console.warn(`Agent ${agentId} not found, returning empty history`);
          return [];
        }
        agentIntId = agentResult.rows[0].id;
      }

      const result = await pool.query(
        `SELECT m.*, c.user_id, c.agent_id 
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.conversation_id
         WHERE c.user_id = $1 AND c.agent_id = $2
         ORDER BY m.created_at DESC 
         LIMIT $3`,
        [userIntId, agentIntId, count]
      );

      // Format and return in chronological order (oldest first)
      return result.rows.reverse().map((row) => ({
        role: row.sender_type === "user" ? "user" : "assistant",
        content: row.content,
        text: row.content, // Legacy compatibility
        timestamp: row.created_at,
        isUser: row.sender_type === "user",
        user_id: row.sender_type === "user" ? row.user_id : row.agent_id,
        agent_id: row.sender_type === "agent" ? row.agent_id : row.user_id,
      }));
    } catch (error) {
      console.error("Error getting latest messages:", error);
      // Return empty array instead of throwing to not break chat
      return [];
    }
  }

  // Delete chat history between user and agent
  static async deleteChatHistory(userId, agentId) {
    try {
      const result = await pool.query(
        `DELETE FROM chatHistory 
         WHERE (user_id = $1 AND agent_id = $2) 
            OR (user_id = $2 AND agent_id = $1)`,
        [userId, agentId]
      );
      return result.rowCount;
    } catch (error) {
      console.error("Error deleting chat history:", error);
      throw error;
    }
  }

  // Get chat history for v1/chai/getHistory endpoint (using conversations and messages)
  static async getChaiChatHistory(userId, agentId, limit = 50, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT 
          m.id,
          m.conversation_id,
          m.sender_type,
          m.content,
          m.created_at as timestamp,
          c.user_id,
          c.agent_id
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.conversation_id
         WHERE c.user_id = $1 AND c.agent_id = $2
         ORDER BY m.created_at DESC 
         LIMIT $3 OFFSET $4`,
        [userId, agentId, limit, offset]
      );

      // Format messages to match expected structure
      const formattedMessages = result.rows.map((row) => ({
        id: row.id,
        user_id: row.sender_type === "user" ? row.user_id : row.agent_id,
        agent_id: row.sender_type === "agent" ? row.agent_id : row.user_id,
        text: row.content,
        content: row.content,
        timestamp: row.timestamp,
        message_type: "text",
        role: row.sender_type === "user" ? "user" : "assistant",
        isUser: row.sender_type === "user",
      }));

      return {
        messages: formattedMessages,
        totalCount: formattedMessages.length,
        hasMore: formattedMessages.length === limit,
      };
    } catch (error) {
      console.error("Error getting chai chat history:", error);
      throw error;
    }
  }

  // Helper method to decrypt messages from database results
  static decryptMessages(messages) {
    const encryptionService = DataService.getEncryptionService();

    return messages.map((message) => {
      try {
        // Only decrypt if the text appears to be encrypted
        if (message.text && encryptionService.isEncrypted(message.text)) {
          message.text = encryptionService.decrypt(message.text);
        }
        return message;
      } catch (error) {
        console.error("Error decrypting message:", error);
        // Return message with placeholder text if decryption fails
        message.text = "[Message could not be decrypted]";
        return message;
      }
    });
  }
}

module.exports = DataService;
