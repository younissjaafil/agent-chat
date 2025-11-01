require("dotenv").config();
const player = require("play-sound")();
const readline = require("readline");
const { transcribe } = require("./services/whisperService");
const { MiniMaxTTSService } = require("./services/miniMaxTTSService");
const { VoiceRecordingService } = require("./services/voiceRecordingService");

class VoiceChatAssistant {
  constructor(userId = null, agentId = null) {
    this.ttsService = new MiniMaxTTSService();
    this.recordingService = new VoiceRecordingService();
    this.conversationHistory = [];
    this.isRunning = false;

    // User and agent configuration for voice selection
    this.userId = userId;
    this.agentId = agentId;
    this.selectedUser = false;
    this.selectedAgent = false;

    // Files
    this.recordFile = "temp_voice.wav";
    this.replyFile = "temp_reply.mp3";

    // Setup readline interface for user input
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async initialize() {
    console.log("🎙️ Voice Chat Assistant Starting...");

    // If no user/agent specified, prompt for selection
    if (!this.userId || !this.agentId) {
      await this.selectUserAndAgent();
    }

    console.log(`👤 User: ${this.userId}, Agent: ${this.agentId}`);
    console.log(
      "📋 Available voices:",
      this.ttsService.getAvailableVoices().join(", ")
    );
    console.log("✅ Ready to chat!");
    console.log("");
  }

  // Dynamic user and agent selection
  async selectUserAndAgent() {
    console.log("🔧 Setting up your chat session...");
    console.log("=".repeat(50));

    // Select user if not provided
    if (!this.userId) {
      this.userId = await this.selectUser();
    }

    // Select agent if not provided
    if (!this.agentId) {
      this.agentId = await this.selectAgent();
    }
  }

  async selectUser() {
    console.log("\n👤 Select User (Who are you?):");
    console.log("1. Quick select from common users");
    console.log("2. Enter custom user ID");
    console.log("3. Generate random user");

    const choice = await this.askQuestion("Choose option (1-3): ");

    switch (choice.trim()) {
      case "1":
        return await this.selectFromCommonUsers();
      case "2":
        return await this.enterCustomUserId();
      case "3":
        return this.generateRandomUser();
      default:
        console.log("Invalid choice, using random user...");
        return this.generateRandomUser();
    }
  }

  async selectFromCommonUsers() {
    const commonUsers = [
      "user123",
      "user124",
      "alice",
      "bob",
      "charlie",
      "diana",
      "eve",
      "frank",
      "grace",
      "henry",
      "moe",
      "sarah",
      "mike",
      "lisa",
      "john",
    ];

    console.log("\n📋 Common Users:");
    commonUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user}`);
    });

    const choice = await this.askQuestion(
      `Select user (1-${commonUsers.length}): `
    );
    const index = parseInt(choice) - 1;

    if (index >= 0 && index < commonUsers.length) {
      return commonUsers[index];
    } else {
      console.log("Invalid selection, using user123...");
      return "user123";
    }
  }

  async enterCustomUserId() {
    const userId = await this.askQuestion("Enter your user ID: ");
    return userId.trim() || this.generateRandomUser();
  }

  generateRandomUser() {
    const randomId = Math.floor(Math.random() * 100) + 1;
    return `user${randomId.toString().padStart(3, "0")}`;
  }

  async selectAgent() {
    console.log("\n🤖 Select AI Agent (Who do you want to talk to?):");
    console.log("1. Quick select from available agents");
    console.log("2. Enter custom agent ID");
    console.log("3. Generate random agent");

    const choice = await this.askQuestion("Choose option (1-3): ");

    switch (choice.trim()) {
      case "1":
        return await this.selectFromAvailableAgents();
      case "2":
        return await this.enterCustomAgentId();
      case "3":
        return this.generateRandomAgent();
      default:
        console.log("Invalid choice, using random agent...");
        return this.generateRandomAgent();
    }
  }

  async selectFromAvailableAgents() {
    const availableAgents = [
      {
        id: "asid_friendly_001",
        name: "User123's Friendly Agent",
        creator: "user123",
      },
      {
        id: "asid_professional_001",
        name: "User123's Professional Agent",
        creator: "user123",
      },
      { id: "moe_agent", name: "Moe's Personal Agent", creator: "moe" },
      { id: "alice_agent", name: "Alice's Personal Agent", creator: "alice" },
      { id: "bob_agent", name: "Bob's Personal Agent", creator: "bob" },
      {
        id: "charlie_agent",
        name: "Charlie's Personal Agent",
        creator: "charlie",
      },
      { id: "diana_agent", name: "Diana's Personal Agent", creator: "diana" },
      { id: "eve_agent", name: "Eve's Personal Agent", creator: "eve" },
      { id: "frank_agent", name: "Frank's Personal Agent", creator: "frank" },
      { id: "grace_agent", name: "Grace's Personal Agent", creator: "grace" },
    ];

    console.log("\n🤖 Available Agents:");
    availableAgents.forEach((agent, index) => {
      console.log(
        `${index + 1}. ${agent.name} (${agent.id}) - Voice: ${agent.creator}`
      );
    });

    const choice = await this.askQuestion(
      `Select agent (1-${availableAgents.length}): `
    );
    const index = parseInt(choice) - 1;

    if (index >= 0 && index < availableAgents.length) {
      console.log(
        `✅ Selected: ${availableAgents[index].name} - Will use ${availableAgents[index].creator}'s voice`
      );
      return availableAgents[index].id;
    } else {
      console.log("Invalid selection, using random agent...");
      return this.generateRandomAgent();
    }
  }

  async enterCustomAgentId() {
    const agentId = await this.askQuestion("Enter agent ID: ");
    return agentId.trim() || this.generateRandomAgent();
  }

  generateRandomAgent() {
    const agentTypes = [
      "friendly",
      "professional",
      "casual",
      "formal",
      "creative",
    ];
    const randomUser = Math.floor(Math.random() * 100) + 1;
    const randomType =
      agentTypes[Math.floor(Math.random() * agentTypes.length)];
    return `user${randomUser.toString().padStart(3, "0")}_${randomType}_agent`;
  }

  async processUserSpeech(audioFile) {
    try {
      console.log("🧠 Transcribing speech...");
      const userText = await transcribe(audioFile);
      console.log(`🧑 You said: "${userText}"`);

      if (!userText.trim()) {
        console.log("⚠️ No speech detected, please try again.");
        return null;
      }

      return userText;
    } catch (error) {
      console.error("❌ Transcription failed:", error.message);
      return null;
    }
  }

  async generateAIResponse(userText) {
    // Add to conversation history
    this.conversationHistory.push({ role: "user", content: userText });

    // Simple AI response logic (you can replace this with OpenAI GPT or other AI models)
    const responses = [
      "That's really interesting! Tell me more about that.",
      "I understand what you're saying. What would you like to know?",
      "Thanks for sharing that with me. How can I help you today?",
      "I hear you! That sounds important to you.",
      "That's a great point. What else is on your mind?",
      "I appreciate you telling me that. Is there anything specific I can assist with?",
    ];

    // For demo purposes, use a simple response
    let aiResponse;
    if (
      userText.toLowerCase().includes("hello") ||
      userText.toLowerCase().includes("hi")
    ) {
      aiResponse =
        "Hello! It's great to hear from you. How are you doing today?";
    } else if (
      userText.toLowerCase().includes("bye") ||
      userText.toLowerCase().includes("goodbye")
    ) {
      aiResponse =
        "Goodbye! It was wonderful talking with you. Have a great day!";
    } else if (userText.toLowerCase().includes("how are you")) {
      aiResponse =
        "I'm doing well, thank you for asking! I'm here and ready to chat with you.";
    } else {
      // Random response for other inputs
      aiResponse = responses[Math.floor(Math.random() * responses.length)];
    }

    this.conversationHistory.push({ role: "assistant", content: aiResponse });
    console.log(`🤖 AI: "${aiResponse}"`);

    return aiResponse;
  }

  async speakResponse(text) {
    try {
      console.log("🗣️ Generating speech...");

      // Get the appropriate voice ID for this user/agent combination
      const voiceId = await this.ttsService.getVoiceIdForAgent(
        this.userId,
        this.agentId
      );

      await this.ttsService.textToSpeech(text, this.replyFile, voiceId);

      console.log("🔊 Playing response...");
      return new Promise((resolve, reject) => {
        player.play(this.replyFile, (err) => {
          if (err) {
            console.error("❌ Audio playback failed:", err);
            reject(err);
          } else {
            console.log("✅ Playback complete");
            resolve();
          }
        });
      });
    } catch (error) {
      console.error("❌ Speech generation failed:", error.message);
      throw error;
    }
  }

  async handleVoiceInteraction() {
    try {
      // Record user voice
      await this.recordingService.recordVoice(this.recordFile, 5);

      // Process the recording
      const userText = await this.processUserSpeech(this.recordFile);
      if (!userText) return;

      // Check for exit commands
      if (
        userText.toLowerCase().includes("exit") ||
        userText.toLowerCase().includes("quit") ||
        userText.toLowerCase().includes("stop")
      ) {
        console.log("👋 Goodbye! Voice chat ending...");
        this.isRunning = false;
        return;
      }

      // Generate AI response
      const aiResponse = await this.generateAIResponse(userText);

      // Speak the response
      await this.speakResponse(aiResponse);
    } catch (error) {
      console.error("❌ Voice interaction failed:", error.message);
      console.log("🔄 Continuing to next interaction...");
    }
  }

  async startVoiceChat() {
    this.isRunning = true;
    console.log("🎤 Voice Chat Started!");
    console.log("💡 Say 'exit', 'quit', or 'stop' to end the chat");
    console.log("⏱️ You have 5 seconds to speak each time");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    while (this.isRunning) {
      console.log("\n🎙️ Ready for your input...");
      await this.handleVoiceInteraction();

      if (this.isRunning) {
        // Small pause between interactions
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this.cleanup();
  }

  async startInteractiveMenu() {
    while (true) {
      console.log("\n🎙️ Voice Chat Assistant Menu:");
      console.log("1. Start Voice Chat");
      console.log("2. Test Text-to-Speech");
      console.log("3. Test Voice Recording");
      console.log("4. View Conversation History");
      console.log("5. Change User/Agent");
      console.log("6. Show Current Session Info");
      console.log("7. Exit");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      const choice = await this.askQuestion("Choose an option (1-7): ");

      switch (choice.trim()) {
        case "1":
          await this.startVoiceChat();
          break;
        case "2":
          await this.testTextToSpeech();
          break;
        case "3":
          await this.testVoiceRecording();
          break;
        case "4":
          this.showConversationHistory();
          break;
        case "5":
          await this.changeUserAgent();
          break;
        case "6":
          await this.showSessionInfo();
          break;
        case "7":
          console.log("👋 Goodbye!");
          this.cleanup();
          return;
        default:
          console.log("❌ Invalid choice. Please try again.");
      }
    }
  }

  async changeUserAgent() {
    console.log("\n🔄 Changing User/Agent Configuration...");
    this.userId = null;
    this.agentId = null;
    await this.selectUserAndAgent();
    console.log("✅ Session updated!");
  }

  async showSessionInfo() {
    console.log("\n📊 Current Session Information:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`👤 Current User: ${this.userId}`);
    console.log(`🤖 Current Agent: ${this.agentId}`);

    try {
      const voiceId = await this.ttsService.getVoiceIdForAgent(
        this.userId,
        this.agentId
      );
      console.log(`🎤 Agent Voice ID: ${voiceId}`);
    } catch (error) {
      console.log(`🎤 Agent Voice ID: Error getting voice (${error.message})`);
    }

    console.log(`💬 Conversation Messages: ${this.conversationHistory.length}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  async testTextToSpeech() {
    const text = await this.askQuestion("Enter text to convert to speech: ");
    if (text.trim()) {
      try {
        await this.speakResponse(text);
      } catch (error) {
        console.error("❌ TTS test failed:", error.message);
      }
    }
  }

  async testVoiceRecording() {
    try {
      console.log("🎤 Testing voice recording...");
      await this.recordingService.recordVoice(this.recordFile, 3);
      const transcribedText = await this.processUserSpeech(this.recordFile);
      console.log(
        `✅ Recording test complete. Transcribed: "${transcribedText}"`
      );
    } catch (error) {
      console.error("❌ Recording test failed:", error.message);
    }
  }

  showConversationHistory() {
    if (this.conversationHistory.length === 0) {
      console.log("📝 No conversation history yet.");
      return;
    }

    console.log("\n📝 Conversation History:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    this.conversationHistory.forEach((entry, index) => {
      const icon = entry.role === "user" ? "🧑" : "🤖";
      console.log(`${icon} ${entry.role.toUpperCase()}: ${entry.content}`);
    });
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  askQuestion(question) {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  cleanup() {
    this.rl.close();

    // Clean up temporary files
    const fs = require("fs");
    try {
      if (fs.existsSync(this.recordFile)) fs.unlinkSync(this.recordFile);
      if (fs.existsSync(this.replyFile)) fs.unlinkSync(this.replyFile);
    } catch (error) {
      // Ignore cleanup errors
    }

    console.log("🧹 Cleanup complete");
  }
}

// Start the application
async function main() {
  const assistant = new VoiceChatAssistant();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\n🛑 Shutting down gracefully...");
    assistant.cleanup();
    process.exit(0);
  });

  try {
    await assistant.initialize();
    await assistant.startInteractiveMenu();
  } catch (error) {
    console.error("❌ Fatal error:", error.message);
    assistant.cleanup();
    process.exit(1);
  }
}

// Run only if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = { VoiceChatAssistant };
