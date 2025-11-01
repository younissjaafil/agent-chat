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
      const result = await pool.query(
        "SELECT * FROM agents WHERE agent_id = $1 OR id = $1",
        [agentId]
      );
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

  // Store a chat message (with encryption)
  static async storeChatMessage(userId, agentId, text, messageType = "text") {
    try {
      const encryptionService = DataService.getEncryptionService();

      // Encrypt the message text before storing
      const encryptedText = encryptionService.encrypt(text);

      const result = await pool.query(
        `INSERT INTO chatHistory (user_id, agent_id, text, message_type) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [userId, agentId, encryptedText, messageType]
      );

      // Return the result with decrypted text for immediate use
      const storedMessage = result.rows[0];
      storedMessage.text = text; // Return original unencrypted text

      return storedMessage;
    } catch (error) {
      console.error("Error storing chat message:", error);
      throw error;
    }
  }

  // Get chat history between user and agent (with decryption)
  static async getChatHistory(userId, agentId, limit = 50, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT * FROM chatHistory 
         WHERE (user_id = $1 AND agent_id = $2) 
            OR (user_id = $2 AND agent_id = $1)
         ORDER BY timestamp DESC 
         LIMIT $3 OFFSET $4`,
        [userId, agentId, limit, offset]
      );

      // Decrypt messages before returning
      return DataService.decryptMessages(result.rows);
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

  // Get latest messages for a conversation (with decryption)
  static async getLatestMessages(userId, agentId, count = 10) {
    try {
      const result = await pool.query(
        `SELECT * FROM chatHistory 
         WHERE (user_id = $1 AND agent_id = $2) 
            OR (user_id = $2 AND agent_id = $1)
         ORDER BY timestamp DESC 
         LIMIT $3`,
        [userId, agentId, count]
      );

      // Decrypt messages and return in chronological order
      const decryptedMessages = DataService.decryptMessages(result.rows);
      return decryptedMessages.reverse(); // Return in chronological order
    } catch (error) {
      console.error("Error getting latest messages:", error);
      throw error;
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

  // Get chat history for v1/chai/getHistory endpoint
  static async getChaiChatHistory(userId, agentId, limit = 50, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT 
          id,
          user_id,
          agent_id,
          text,
          timestamp,
          message_type
         FROM chatHistory 
         WHERE (user_id = $1 AND agent_id = $2) 
            OR (user_id = $2 AND agent_id = $1)
         ORDER BY timestamp DESC 
         LIMIT $3 OFFSET $4`,
        [userId, agentId, limit, offset]
      );

      return {
        messages: result.rows,
        totalCount: result.rows.length,
        hasMore: result.rows.length === limit,
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
