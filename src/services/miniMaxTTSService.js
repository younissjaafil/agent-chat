const axios = require("axios");
const fs = require("fs");
const { pool } = require("../utils/database");

class MiniMaxTTSService {
  constructor() {
    this.apiKey = process.env.MINIMAX_API_KEY;
    this.groupId = process.env.MINIMAX_GROUP_ID;
    this.baseUrl = "https://api.minimax.io"; // Reverting back
  }

  async textToSpeech(
    text,
    outputFile = "reply.mp3",
    voiceId = null,
    agentId = null
  ) {
    try {
      console.log("🔗 Making request to MiniMax TTS API...");
      console.log("📝 Text to convert:", text.substring(0, 50) + "...");

      // Use provided voiceId or fall back to MiniMax default voice
      // Note: This fallback is only used when textToSpeech is called directly
      // In voice chat flows, voiceId should always be provided from database lookup
      const selectedVoiceId = voiceId || "Min000001";
      console.log("🎤 Using voice ID:", selectedVoiceId);

      // Get emotion/tone from agent's personality
      const emotion = await this.getAgentEmotion(agentId);
      console.log("😊 Using emotion:", emotion);

      const response = await axios.post(
        `${this.baseUrl}/v1/t2a_v2?GroupId=${this.groupId}`,
        {
          model: "speech-02-hd",
          text: text,
          stream: false,
          voice_setting: {
            voice_id: selectedVoiceId, // Now dynamic based on user/agent
            speed: 1.0,
            vol: 1.0,
            pitch: 0,
            emotion: emotion,
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: "mp3",
            channel: 1,
          },
          output_format: "hex",
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "X-GroupId": this.groupId, // Try adding GroupId as header too
          },
          timeout: 30000, // 30 second timeout
        }
      );

      console.log("📊 Response status:", response.status);
      console.log(
        "📄 Response data structure:",
        Object.keys(response.data || {})
      );

      // First check if the API returned an error
      if (
        response.data &&
        response.data.base_resp &&
        response.data.base_resp.status_code !== 0
      ) {
        const errorCode = response.data.base_resp.status_code;
        const errorMsg = response.data.base_resp.status_msg || "Unknown error";
        console.error(`❌ MiniMax API Error ${errorCode}: ${errorMsg}`);

        if (errorCode === 2054) {
          throw new Error(
            `Voice ID not found: ${selectedVoiceId}. Please check if this voice ID exists in your MiniMax account.`
          );
        }

        throw new Error(`MiniMax API Error ${errorCode}: ${errorMsg}`);
      }

      if (response.data && response.data.data && response.data.data.audio) {
        let hex = response.data.data.audio;
        // Remove "0x" prefix if present
        if (hex.startsWith("0x")) {
          hex = hex.slice(2);
        }

        // Convert hex to buffer and save as MP3
        const audioBuffer = Buffer.from(hex, "hex");
        fs.writeFileSync(outputFile, audioBuffer);

        console.log(`🗣️ Audio saved to ${outputFile}`);
        return outputFile;
      } else {
        console.log(
          "📄 Full response:",
          JSON.stringify(response.data, null, 2)
        );
        throw new Error("Invalid response structure from MiniMax API");
      }
    } catch (error) {
      console.error("MiniMax TTS Error details:");
      if (error.response) {
        console.error("Status:", error.response.status);
        console.error("Status Text:", error.response.statusText);
        console.error("Data:", JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.error("No response received:", error.message);
      } else {
        console.error("Request setup error:", error.message);
      }
      throw error;
    }
  }

  // Get emotion/tone for agent from personality table
  async getAgentEmotion(agentId) {
    try {
      if (!agentId) {
        console.log("⚠️ No agent ID provided, using default emotion (happy)");
        return "happy";
      }

      console.log(`🎭 Getting emotion for agent: ${agentId}`);

      // Query personality table to get tone for the agent
      const query = `
        SELECT tone 
        FROM personality 
        WHERE asid = $1
        LIMIT 1
      `;

      const result = await pool.query(query, [agentId]);

      if (result.rows.length > 0 && result.rows[0].tone) {
        const tone = result.rows[0].tone.toLowerCase().trim();
        console.log(`🎭 Found emotion for agent ${agentId}: ${tone}`);

        // Use the tone directly from database (assuming it's already in MiniMax format)
        return tone;
      } else {
        console.log(
          `⚠️ No personality tone found for agent ${agentId}, using default (happy)`
        );
        return "happy";
      }
    } catch (error) {
      console.error(
        `Error getting emotion for agent ${agentId}:`,
        error.message
      );
      return "happy"; // Safe fallback - MiniMax default
    }
  }

  // Get voice ID for a specific AI agent
  // The agent should speak with the voice of the user who created it
  async getVoiceIdForAgent(userId, receiverId) {
    try {
      console.log(
        `🎵 Getting voice for agent: ${receiverId} (requested by user: ${userId})`
      );

      // First, try to find the agent's creator in the database
      let agentCreatorId = await this.findAgentCreator(receiverId);

      if (!agentCreatorId) {
        console.log(
          `⚠️ No creator found for agent ${receiverId}, using fallback mapping`
        );
        // Fallback to static mapping for known agents
        agentCreatorId = this.getStaticAgentCreator(receiverId);
      }

      // Get the voice clone ID for the agent's creator
      try {
        const voiceId = await this.getVoiceCloneId(agentCreatorId);
        console.log(
          `🎤 Agent ${receiverId} created by ${agentCreatorId} -> voice: ${voiceId}`
        );
        return voiceId;
      } catch (voiceError) {
        console.error(
          `❌ Failed to get voice for agent creator ${agentCreatorId}:`,
          voiceError.message
        );

        // Only keep CR8's real voice ID as a temporary fallback
        if (agentCreatorId === "CR8") {
          console.log(`🔄 Using static voice mapping for CR8: Min755521`);
          return "Min755521"; // CR8's actual voice ID from user_data table
        }

        // No fallback to fake IDs - throw error instead
        throw new Error(
          `Voice clone ID not found for agent creator ${agentCreatorId}. Please ensure the user has a voice clone recorded.`
        );
      }
    } catch (error) {
      console.error("Error getting voice ID for agent:", error);
      throw error; // Don't use fallback - re-throw the error
    }
  }

  // Query database to find who created this AI agent
  async findAgentCreator(agentId) {
    try {
      console.log(`🔍 Looking up creator for agent: ${agentId}`);

      // Try multiple possible table structures
      const queries = [
        // Query personality table first (has creator_id column)
        `SELECT creator_id FROM personality WHERE asid = $1 LIMIT 1`,

        // Query agents table (also has creator_id column)
        `SELECT creator_id FROM agents WHERE agent_id = $1 LIMIT 1`,

        // Fallback: Query instances table (userid = student who chats, not creator)
        // This is a fallback for legacy data where creator might be linked via instances
        `SELECT userid as creator_id FROM instances WHERE asid = $1 LIMIT 1`,
      ];

      for (const query of queries) {
        try {
          const result = await pool.query(query, [agentId]);

          if (result.rows.length > 0) {
            const creator = result.rows[0].creator_id;
            if (creator) {
              console.log(`✅ Found creator for agent ${agentId}: ${creator}`);
              return creator;
            }
          }
        } catch (queryError) {
          console.log(`📊 Query failed (trying next): ${queryError.message}`);
          continue;
        }
      }

      console.log(`⚠️ No creator found in database for agent ${agentId}`);
      return null;
    } catch (error) {
      console.log(
        `📊 Database lookup failed for agent ${agentId}:`,
        error.message
      );
      return null;
    }
  }

  // Static mapping for known agents (fallback when database query fails)
  getStaticAgentCreator(agentId) {
    console.log(`🔍 Analyzing agent ID pattern: ${agentId}`);

    // Check if it's a CR8 pattern: asid_CR8_timestamp
    const cr8AgentPattern = /^asid_CR8_\d+$/;
    if (cr8AgentPattern.test(agentId)) {
      console.log(`🔍 Detected CR8 agent: ${agentId} -> created by CR8`);
      return "CR8";
    }

    // Check if it's a user pattern in ASID: asid_userXXX_timestamp
    const asidUserPattern = /^asid_(user\d+)_\d+$/;
    const asidMatch = agentId.match(asidUserPattern);

    if (asidMatch) {
      const userId = asidMatch[1];
      console.log(
        `🔍 Detected ASID user pattern: ${agentId} -> created by ${userId}`
      );
      return userId;
    }

    // Check if it's a standard pattern: userXXX_type_agent
    const userAgentPattern = /^(user\d+)_\w+_agent$/;
    const match = agentId.match(userAgentPattern);

    if (match) {
      const userId = match[1];
      console.log(
        `🔍 Detected user agent pattern: ${agentId} -> created by ${userId}`
      );
      return userId;
    }

    // Check for generic agent patterns: name_agent
    if (agentId.endsWith("_agent")) {
      const creatorName = agentId.replace("_agent", "");
      // Only if it's not already handled above
      if (!creatorName.match(/^user\d+_\w+$/)) {
        console.log(
          `🔍 Detected name-based agent: ${agentId} -> created by ${creatorName}`
        );
        return creatorName;
      }
    }

    console.log(
      `⚠️ No pattern matched for ${agentId}, cannot determine creator`
    );
    return null; // Return null instead of fake user
  }

  // Get the voice clone ID for a specific user
  async getVoiceCloneId(userId) {
    try {
      console.log(`🎤 Getting voice clone ID for user: ${userId}`);

      // Try multiple database lookups for voice clone ID
      const queries = [
        // Query user_data table (mentioned in the issue) - try different column combinations
        `SELECT clone_id FROM user_data WHERE user_id = $1 LIMIT 1`,
        `SELECT voice_clone_id FROM user_data WHERE user_id = $1 LIMIT 1`,
        `SELECT clone_id FROM user_data WHERE username = $1 LIMIT 1`,
        `SELECT voice_clone_id FROM user_data WHERE username = $1 LIMIT 1`,

        // Query users table (current structure based on screenshots)
        `SELECT voice_clone_id FROM users WHERE user_id = $1 OR username = $1 LIMIT 1`,
        `SELECT clone_id FROM users WHERE user_id = $1 OR username = $1 LIMIT 1`,

        // Query voice_clones table if it exists
        `SELECT voice_clone_id FROM voice_clones WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      ];

      for (const query of queries) {
        try {
          console.log(`🔍 Trying query: ${query} with userId: ${userId}`);
          const result = await pool.query(query, [userId]);

          if (result.rows.length > 0) {
            const voiceCloneId =
              result.rows[0].voice_clone_id || result.rows[0].clone_id;
            if (voiceCloneId) {
              console.log(
                `✅ Found voice clone for user ${userId}: ${voiceCloneId}`
              );
              return voiceCloneId;
            }
          } else {
            console.log(`📊 No rows found for query: ${query}`);
          }
        } catch (queryError) {
          console.log(`📊 Query failed: ${queryError.message}`);
          continue;
        }
      }

      console.log(
        `❌ ERROR: No voice clone found in database for user ${userId}! This should not happen if the user exists.`
      );

      // Instead of generating, throw an error or return a default
      throw new Error(
        `Voice clone ID not found for user ${userId} in database. Please ensure the user has a voice clone recorded.`
      );
    } catch (error) {
      console.log(
        `📊 Error getting voice clone for user ${userId}:`,
        error.message
      );
      throw error; // Re-throw the error instead of falling back to generation
    }
  }
}

module.exports = { MiniMaxTTSService };
