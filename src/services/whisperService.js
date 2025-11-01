const OpenAI = require("openai");
const fs = require("fs");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function transcribe(filePath) {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1",
    });
    return { text: transcription.text };
  } catch (error) {
    console.error("Transcription error:", error);
    throw error;
  }
}

module.exports = { transcribe };
