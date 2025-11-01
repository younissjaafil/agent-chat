/**
 * Tool Registry Module for Universal AI Agents
 * JavaScript/Node.js version
 */

const axios = require("axios");
const DataService = require("./dataService");

class Tool {
  constructor(name, description, parameters, func) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.function = func;
  }
}

class ToolRegistry {
  constructor(knowledgeBase = null) {
    this.tools = {};
    this.knowledgeBase = knowledgeBase;
    this._registerTools();
    console.log("🛠️ Tools registered!");
  }

  _registerTools() {
    // Web Search Tools
    this.registerTool(
      new Tool(
        "web_search",
        "Search the web for information.",
        {
          query: {
            type: "string",
            description: "Search query",
            required: true,
          },
        },
        this._webSearch.bind(this)
      )
    );

    // Crypto Tools
    this.registerTool(
      new Tool(
        "get_crypto_price",
        "Get cryptocurrency prices.",
        {
          symbol: {
            type: "string",
            description: "Crypto symbol",
            default: "bitcoin",
          },
        },
        this._getCryptoPrice.bind(this)
      )
    );

    // News Tools
    this.registerTool(
      new Tool(
        "get_news",
        "Get latest news.",
        {
          topic: { type: "string", description: "News topic", default: null },
          count: {
            type: "integer",
            description: "Number of articles",
            default: 3,
          },
        },
        this._getNews.bind(this)
      )
    );

    // Weather Tools
    this.registerTool(
      new Tool(
        "get_weather",
        "Get weather information.",
        {
          location: {
            type: "string",
            description: "City name",
            required: true,
          },
        },
        this._getWeather.bind(this)
      )
    );

    // Knowledge Base Tool
    this.registerTool(
      new Tool(
        "search_knowledge_base",
        "Search user's knowledge base for relevant documents, videos, or audio content.",
        {
          query: {
            type: "string",
            description: "Search query for knowledge base",
            required: true,
          },
          documentTypes: {
            type: "array",
            description: "Filter by document types (docs, audio, video)",
            required: false,
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return",
            required: false,
          },
        },
        this._searchKnowledgeBase.bind(this)
      )
    );
  }

  registerTool(tool) {
    this.tools[tool.name] = tool;
  }

  getTool(name) {
    return this.tools[name] || null;
  }

  async _searchKnowledge(query) {
    if (!this.knowledgeBase) {
      return "Knowledge base not available!";
    }

    try {
      const results = await this.knowledgeBase.searchKnowledge(query, {
        nResults: 2,
      });

      if (!results || results.length === 0) {
        return "No information found in my knowledge base.";
      }

      let response = "Based on my knowledge:\n\n";
      results.forEach((result, index) => {
        const sourceName =
          result.type !== "website"
            ? require("path").basename(result.source)
            : result.source;
        response += `${index + 1}. From ${result.type} '${sourceName}':\n`;
        response += `   ${result.content.substring(0, 150)}...\n\n`;
      });

      return response;
    } catch (error) {
      console.error("Knowledge search error:", error);
      return "Error searching knowledge base.";
    }
  }

  async _webSearch(query) {
    try {
      // Simple DuckDuckGo search
      const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(
        query
      )}&format=json&no_html=1&skip_disambig=1`;

      const response = await axios.get(searchUrl, { timeout: 10000 });

      if (response.status === 200) {
        const data = response.data;

        if (data.Abstract) {
          return `Search result: ${data.Abstract}`;
        } else if (data.Answer) {
          return `Answer: ${data.Answer}`;
        } else if (data.Definition) {
          return `Definition: ${data.Definition}`;
        } else {
          const topics = data.RelatedTopics || [];
          if (topics.length > 0) {
            return `Related info: ${
              topics[0].Text || "No specific results found"
            }`;
          } else {
            return "No specific web results found.";
          }
        }
      }

      return "Web search temporarily unavailable.";
    } catch (error) {
      console.error("Web search failed:", error);
      return "Web search had an issue.";
    }
  }

  async _getCryptoPrice(symbol = "bitcoin") {
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd&include_24hr_change=true`,
        { timeout: 10000 }
      );

      if (response.status === 200) {
        const data = response.data;
        if (data[symbol]) {
          const price = data[symbol].usd;
          const change = data[symbol].usd_24h_change || 0;
          const changeText = change
            ? `(${change > 0 ? "+" : ""}${change.toFixed(2)}%)`
            : "";
          return `${
            symbol.charAt(0).toUpperCase() + symbol.slice(1)
          } is priced at $${price.toLocaleString()} ${changeText}`;
        }
      }
      return `Could not fetch ${symbol} price.`;
    } catch (error) {
      console.error("Crypto price error:", error);
      return `Error fetching ${symbol} price.`;
    }
  }

  async _getNews(topic = null, count = 3) {
    try {
      // Try NewsAPI if available
      const newsApiKey = process.env.NEWSAPI_KEY;
      if (newsApiKey) {
        let url;
        if (
          topic &&
          (topic.toLowerCase().includes("bitcoin") ||
            topic.toLowerCase().includes("crypto"))
        ) {
          url = `https://newsapi.org/v2/everything?q=bitcoin+cryptocurrency&sortBy=publishedAt&language=en&apiKey=${newsApiKey}`;
        } else {
          url = `https://newsapi.org/v2/top-headlines?country=us&language=en&apiKey=${newsApiKey}`;
        }

        const response = await axios.get(url, { timeout: 10000 });
        if (response.status === 200) {
          const articles = response.data.articles.slice(0, count);
          if (articles.length > 0) {
            const newsItems = articles.map(
              (article, index) => `${index + 1}. ${article.title}`
            );
            return "Latest news:\n" + newsItems.join("\n");
          }
        }
      }

      // Fallback to web search
      return await this._webSearch(
        topic ? `latest news ${topic}` : "latest news today"
      );
    } catch (error) {
      console.error("News error:", error);
      return "News temporarily unavailable.";
    }
  }

  async _getWeather(location) {
    try {
      const weatherApiKey = process.env.WEATHER_API_KEY;
      if (weatherApiKey) {
        const url = `http://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${weatherApiKey}&units=metric`;
        const response = await axios.get(url, { timeout: 10000 });

        if (response.status === 200) {
          const data = response.data;
          const temp = data.main.temp;
          const description = data.weather[0].description;
          const humidity = data.main.humidity;
          return `Weather in ${location}: ${temp}°C, ${description}, humidity ${humidity}%`;
        }
      }

      // Fallback to web search
      return await this._webSearch(`weather in ${location} today`);
    } catch (error) {
      console.error("Weather error:", error);
      return "Weather info temporarily unavailable.";
    }
  }

  // New method to analyze chat history for context
  async _analyzeChatHistory(userInput, userId, agentId, limit = 20) {
    try {
      if (!userId || !agentId) {
        return "";
      }

      // Get recent chat history
      const chatHistory = await DataService.getLatestMessages(
        userId,
        agentId,
        limit
      );

      if (!chatHistory || chatHistory.length === 0) {
        return "";
      }

      // Check if user is asking about themselves or the conversation
      const personalQueries =
        /describe me|tell me about me|what do you know about me|my history|our conversation|what did we talk about|remember when|who am i/i;
      const conversationQueries =
        /our chat|previous conversation|what we discussed|earlier|before|last time|history of our/i;

      if (
        !personalQueries.test(userInput) &&
        !conversationQueries.test(userInput)
      ) {
        return "";
      }

      // Analyze recent messages for context
      let contextInfo = "";
      const userMessages = chatHistory.filter((msg) => msg.user_id === userId);
      const botMessages = chatHistory.filter((msg) => msg.agent_id === agentId);

      if (personalQueries.test(userInput)) {
        // Extract information about the user from their messages
        const topics = new Set();
        const interests = new Set();

        userMessages.forEach((msg) => {
          const text = msg.text.toLowerCase();

          // Extract potential topics/interests
          if (
            text.includes("i like") ||
            text.includes("i love") ||
            text.includes("i enjoy")
          ) {
            const match = text.match(/(?:i like|i love|i enjoy)\s+([^.!?]+)/);
            if (match) interests.add(match[1].trim());
          }

          // Extract mentioned topics
          if (text.includes("about") || text.includes("regarding")) {
            const match = text.match(/(?:about|regarding)\s+([^.!?]+)/);
            if (match) topics.add(match[1].trim());
          }
        });

        contextInfo += "Based on our conversation history:\n";
        if (interests.size > 0) {
          contextInfo += `You've mentioned interest in: ${Array.from(
            interests
          ).join(", ")}\n`;
        }
        if (topics.size > 0) {
          contextInfo += `Topics we've discussed: ${Array.from(topics).join(
            ", "
          )}\n`;
        }
        contextInfo += `We've exchanged ${chatHistory.length} messages recently.\n`;
      }

      if (conversationQueries.test(userInput)) {
        // Provide conversation summary
        contextInfo += "Recent conversation context:\n";
        const recentMessages = chatHistory.slice(-6); // Last 6 messages
        recentMessages.forEach((msg) => {
          const sender = msg.user_id === userId ? "You" : "I";
          const preview =
            msg.text.length > 100
              ? msg.text.substring(0, 100) + "..."
              : msg.text;
          contextInfo += `${sender}: ${preview}\n`;
        });
      }

      return contextInfo;
    } catch (error) {
      console.error("Error analyzing chat history:", error);
      return "";
    }
  }

  // Knowledge Base Search Method
  async _searchKnowledgeBase(query, documentTypes = [], limit = 5) {
    try {
      if (!process.env.TEACH_AI_URL || !process.env.TEACH_SECRET) {
        console.log("Knowledge base service not configured");
        return "Knowledge base search is not available at the moment.";
      }

      const teachAiUrl = process.env.TEACH_AI_URL;
      const authToken = process.env.TEACH_SECRET;

      // Default to current user context if available
      const userId = this.currentUserId || "default_user";

      const searchPayload = {
        query: query,
        limit: limit,
        threshold: 0.7,
        includeContent: true,
      };

      if (documentTypes && documentTypes.length > 0) {
        searchPayload.documentTypes = documentTypes;
      }

      console.log(`🔍 Searching knowledge base for: "${query}"`);

      const response = await axios.post(
        `${teachAiUrl}/v1/tai/teach/search/${userId}`,
        searchPayload,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      if (response.status === 200 && response.data.success) {
        const results = response.data.results || [];

        if (results.length === 0) {
          return "No relevant information found in your knowledge base for this query.";
        }

        // Format the results for the AI agent
        let knowledgeContent = `Found ${results.length} relevant document(s) from your knowledge base:\n\n`;

        results.forEach((result, index) => {
          const docInfo = result.document || {};
          const score = (result.score * 100).toFixed(1);

          knowledgeContent += `📄 **Document ${index + 1}**: ${
            docInfo.name || "Unknown"
          }\n`;
          knowledgeContent += `📊 **Relevance**: ${score}%\n`;
          knowledgeContent += `📝 **Content**: ${
            result.chunk || "No content available"
          }\n`;

          if (docInfo.type) {
            knowledgeContent += `📁 **Type**: ${docInfo.type}\n`;
          }

          if (docInfo.uploadedAt) {
            const uploadDate = new Date(
              docInfo.uploadedAt
            ).toLocaleDateString();
            knowledgeContent += `📅 **Uploaded**: ${uploadDate}\n`;
          }

          knowledgeContent += `\n${"=".repeat(50)}\n\n`;
        });

        return knowledgeContent;
      }

      return "Unable to search knowledge base at the moment.";
    } catch (error) {
      console.error("Knowledge base search error:", error.message);

      if (error.response?.status === 404) {
        return "No knowledge base found for your account. You can upload documents, videos, or audio files to create your personal knowledge base.";
      }

      if (error.response?.status === 401) {
        return "Authentication failed for knowledge base access.";
      }

      return "Knowledge base search temporarily unavailable.";
    }
  }

  // Switcher logic - process query and determine which tools to use
  async processQuery(userInput, instance, userId = null, agentId = null) {
    try {
      let contextInfo = "";

      // Set current user context for knowledge base searches
      this.currentUserId = userId;

      // Check chat history first for personal/conversational queries
      if (userId && agentId) {
        const historyContext = await this._analyzeChatHistory(
          userInput,
          userId,
          agentId
        );
        if (historyContext) {
          contextInfo += historyContext + "\n";
        }
      }

      // Check user's personal knowledge base first (RAG microservice)
      const needsKnowledgeSearch =
        /tell me about|explain|what is|how to|tutorial|document|guide|learn|teach|help me with/i.test(
          userInput
        ) ||
        /my documents|my files|my knowledge|uploaded|document|pdf|video|audio/i.test(
          userInput
        );

      if (needsKnowledgeSearch && userId) {
        console.log("🔍 Checking user's knowledge base first...");
        const knowledgeInfo = await this._searchKnowledgeBase(userInput);
        if (
          knowledgeInfo &&
          !knowledgeInfo.includes("No relevant information found") &&
          !knowledgeInfo.includes("not available") &&
          !knowledgeInfo.includes("temporarily unavailable")
        ) {
          contextInfo += `From your personal knowledge base:\n${knowledgeInfo}\n`;
        }
      }

      // Use legacy knowledge base if available (fallback)
      if (this.knowledgeBase && !contextInfo) {
        const knowledgeResults = await this.knowledgeBase.searchKnowledge(
          userInput,
          { nResults: 3 }
        );
        if (knowledgeResults && knowledgeResults.length > 0) {
          contextInfo += `From ${
            instance.personality_name || "AI"
          }'s knowledge base:\n`;
          knowledgeResults.forEach((result) => {
            contextInfo += `- ${result.content.substring(0, 200)}...\n`;
          });
          contextInfo += "\n";
        }
      }

      // Tool detection logic
      const needsCrypto =
        /bitcoin|btc|crypto|cryptocurrency|ethereum|eth|price/i.test(userInput);
      const needsNews = /news|latest|breaking|headlines/i.test(userInput);
      const needsWeather = /weather|temperature|forecast|climate/i.test(
        userInput
      );
      const needsWebSearch =
        /search|find|what is|who is|tell me about/i.test(userInput) &&
        !contextInfo; // Only search web if no context from history or knowledge base

      // Execute tools based on detection
      if (needsCrypto) {
        const cryptoTool = this.getTool("get_crypto_price");
        if (cryptoTool) {
          const cryptoInfo = await cryptoTool.function();
          contextInfo += `Market info: ${cryptoInfo}\n`;
        }
      }

      if (needsNews) {
        const newsTool = this.getTool("get_news");
        if (newsTool) {
          const newsInfo = await newsTool.function(null, 3);
          contextInfo += `News: ${newsInfo}\n`;
        }
      }

      if (needsWeather) {
        let location = "Beirut"; // Default location
        const locationMatch = userInput.match(/(?:in|for|at)\s+([a-zA-Z\s]+)/i);
        if (locationMatch) {
          location = locationMatch[1].trim();
        }

        const weatherTool = this.getTool("get_weather");
        if (weatherTool) {
          const weatherInfo = await weatherTool.function(location);
          contextInfo += `Weather: ${weatherInfo}\n`;
        }
      }

      if (needsWebSearch && !contextInfo) {
        const webTool = this.getTool("web_search");
        if (webTool) {
          const webInfo = await webTool.function(userInput);
          contextInfo += `Web search: ${webInfo}\n`;
        }
      }

      return contextInfo;
    } catch (error) {
      console.error("Query processing failed:", error);
      return "Sorry, I need a moment to think! Ask me again.";
    }
  }
}

module.exports = { Tool, ToolRegistry };
