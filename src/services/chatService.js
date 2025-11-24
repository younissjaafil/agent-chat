const DataService = require("./dataService");
const { ToolRegistry } = require("./toolRegistry");
const KnowledgeBaseService = require("./knowledgeBaseService");
const axios = require("axios");
const OpenAI = require("openai");

// Simple retry configuration
axios.defaults.timeout = 10000;

class ChatService {
  constructor() {
    // Initialize tool registry
    this.toolRegistry = new ToolRegistry();
    // Initialize knowledge base service
    this.knowledgeBase = new KnowledgeBaseService();
  }

  // Static method to get instance
  static getInstance() {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  // Generate AI response based on agent/personality with tool integration
  static async generateResponse(
    agentId,
    userMessage,
    conversationHistory = [],
    userId = null
  ) {
    try {
      // Get agent/personality data directly using agentId
      let agent = await DataService.getAgentById(agentId);

      // If not found by ID, try by asid for backwards compatibility
      if (!agent) {
        agent = await DataService.getPersonalityByAsid(agentId);
      }

      if (!agent) {
        throw new Error(`Agent not found with ID: ${agentId}`);
      }

      console.log(`✅ Found agent: ${agent.name || agent.personality_name}`);

      // Get tool registry instance
      const chatService = ChatService.getInstance();

      // Search knowledge base FIRST for maximum relevance
      console.log("🧠 Searching knowledge base for relevant information...");
      const knowledgeResult =
        await chatService.knowledgeBase.getKnowledgeForQuery(
          userMessage,
          agentId,
          5 // Max 5 chunks with real OpenAI embeddings (higher quality results)
        );

      // Build knowledge context string
      let knowledgeContext = "";
      if (knowledgeResult.found) {
        console.log(
          `✅ Found knowledge from ${knowledgeResult.fileCount} ${knowledgeResult.source}`
        );
        knowledgeContext = `\n\n=== KNOWLEDGE BASE (${knowledgeResult.source}) ===\n${knowledgeResult.content}\n\nUse the above information to answer questions when relevant. Cite sources.\n`;
      } else {
        console.log("📭 No relevant knowledge found in knowledge base");
      }

      // Process query with tools (switcher logic) - now includes chat history analysis
      const toolContext = await chatService.toolRegistry.processQuery(
        userMessage,
        agent,
        userId,
        agentId
      );

      // Combine knowledge and tool context
      const combinedContext = knowledgeContext + toolContext;

      // Build system prompt from agent/personality data with combined context
      let systemPrompt = this.buildSystemPrompt(agent, combinedContext);

      // Build conversation context
      const messages = [{ role: "system", content: systemPrompt }];

      // Add conversation history if provided
      if (conversationHistory && conversationHistory.length > 0) {
        conversationHistory.forEach((msg) => {
          messages.push({
            role: msg.role || (msg.isUser ? "user" : "assistant"),
            content: msg.content,
          });
        });
      }

      // Add current user message
      messages.push({ role: "user", content: userMessage });

      // Generate AI response
      const response = await this.callAIService(messages);

      // Store the conversation messages (user message and bot response) if userId is provided
      if (userId) {
        try {
          // Store user message
          await DataService.storeChatMessage(
            userId,
            agentId,
            userMessage,
            "text"
          );

          // Store bot response
          await DataService.storeChatMessage(agentId, userId, response, "text");

          console.log(
            `💾 Stored encrypted conversation between user ${userId} and agent ${agentId}`
          );
        } catch (storageError) {
          console.error("Error storing chat messages:", storageError);
          // Don't fail the whole request if storage fails
        }
      }

      return {
        success: true,
        response: response,
        agent: {
          id: agent.id || agent.agent_id,
          name: agent.name || agent.personality_name,
          agentId: agentId,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error generating response:", error);
      return {
        success: false,
        error: error.message,
        response:
          "I'm sorry, I'm having trouble responding right now. Please try again later.",
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Build system prompt from agent/personality data with tool context
  static buildSystemPrompt(agent, toolContext = "") {
    let prompt = "";

    const agentName = agent.name || agent.personality_name;
    const agentTone = agent.tone;
    const agentTraits = agent.trait_array;

    // Use agent name if available
    if (agentName) {
      prompt += `You are ${agentName}, an AI agent with the following characteristics:\n`;
    } else {
      prompt += `You are an AI agent with the following characteristics:\n`;
    }

    // Add tone if available
    if (agentTone) {
      prompt += `- Tone: ${agentTone}\n`;
    }

    // Add trait array if available
    if (agentTraits && Array.isArray(agentTraits)) {
      const traits = agentTraits.join(", ");
      prompt += `- Personality traits: ${traits}\n`;
    }

    // Add behavioral guidelines
    prompt += `- You have a unique personality and respond according to your tone\n`;
    prompt += `- You can have longer conversations (150-300 tokens per response)\n`;
    prompt += `- You remember previous conversations and build relationships\n`;
    prompt += `- You're helpful, engaging, and stay in character\n`;
    prompt += `- You have access to live data through various tools for current information\n\n`;

    // Add tool context if available
    if (toolContext && toolContext.trim()) {
      prompt += `Current live information available to you:\n${toolContext}\n`;
      prompt += `Use this live information to provide accurate, up-to-date responses when relevant.\n\n`;
    }

    if (agentName) {
      prompt += `Respond as ${agentName} would, using your ${
        agentTone || "natural"
      } tone and incorporating your personality traits when relevant.\n`;
    }

    prompt += `Keep responses conversational and engaging, between 50-200 words typically.`;

    // Default behavior if no specific agent data
    if (
      !agentName &&
      !agentTone &&
      (!agentTraits || agentTraits.length === 0)
    ) {
      prompt =
        "You are a helpful AI assistant with access to live data tools. Be friendly, informative, and assist the user with their questions. Keep responses conversational and engaging.";

      // Add tool context even for default agent
      if (toolContext && toolContext.trim()) {
        prompt += `\n\nCurrent live information available to you:\n${toolContext}\n`;
        prompt += `Use this live information to provide accurate, up-to-date responses when relevant.`;
      }
    }

    return prompt;
  }

  // Call OpenAI API with personality-based system prompt
  static async callAIService(messages) {
    try {
      // Check if OpenAI API key is configured
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY environment variable is not set");
      }

      console.log("🤖 Calling OpenAI API with messages:", messages.length);

      // Initialize OpenAI client
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Ensure we have proper message structure
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new Error("Invalid messages format");
      }

      // Call OpenAI API
      const response = await client.chat.completions.create({
        model: "gpt-4o", // You can change this to "gpt-3.5-turbo" for lower costs
        messages: messages,
        max_tokens: 300,
        temperature: 0.7,
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error("No response from OpenAI");
      }

      console.log("✅ OpenAI API response received successfully");
      return response.choices[0].message.content;
    } catch (error) {
      console.error("❌ OpenAI API error:", error.message);

      // Handle specific OpenAI errors
      if (error.code === "insufficient_quota") {
        throw new Error(
          "OpenAI API quota exceeded. Please check your billing."
        );
      } else if (error.code === "invalid_api_key") {
        throw new Error(
          "Invalid OpenAI API key. Please check your configuration."
        );
      } else if (error.code === "rate_limit_exceeded") {
        throw new Error(
          "OpenAI API rate limit exceeded. Please try again later."
        );
      }

      // Generic fallback response
      return "I'm having trouble thinking right now. Could you ask me again?";
    }
  }

  // Get agent info for chat
  static async getAgentInfo(agentId) {
    try {
      const agent = await DataService.getAgentById(agentId);

      if (!agent) {
        return null;
      }

      return {
        id: agent.id || agent.agent_id,
        agentId: agentId,
        name: agent.name || agent.personality_name,
        traits: agent.trait_array,
        tone: agent.tone,
        description: agent.description,
        createdAt: agent.created_at,
      };
    } catch (error) {
      console.error("Error getting agent info:", error);
      throw error;
    }
  }
}

module.exports = ChatService;
