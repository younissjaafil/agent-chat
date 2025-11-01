const record = require("node-record-lpcm16");
const fs = require("fs");

class VoiceRecordingService {
  constructor() {
    this.isRecording = false;
    this.currentRecording = null;
  }

  recordVoice(outputFile = "voice.wav", durationSec = 5) {
    return new Promise((resolve, reject) => {
      if (this.isRecording) {
        reject(new Error("Already recording"));
        return;
      }

      this.isRecording = true;

      try {
        const file = fs.createWriteStream(outputFile);
        const recording = record.record({
          sampleRate: 16000,
          threshold: 0.5,
          verbose: false,
          recordProgram: "rec", // Use 'sox' on Linux/Mac, 'rec' works on most systems
          silence: "1.0s",
        });

        this.currentRecording = recording;

        recording.stream().pipe(file);
        console.log(`🎤 Recording for ${durationSec} seconds... Speak now!`);

        // Auto-stop after duration
        const timer = setTimeout(() => {
          this.stopRecording();
          console.log("🎤 Recording stopped");
          resolve(outputFile);
        }, durationSec * 1000);

        // Handle stream end
        recording.stream().on("end", () => {
          clearTimeout(timer);
          this.isRecording = false;
          resolve(outputFile);
        });

        // Handle errors
        recording.stream().on("error", (error) => {
          clearTimeout(timer);
          this.isRecording = false;
          reject(error);
        });
      } catch (error) {
        this.isRecording = false;
        reject(error);
      }
    });
  }

  stopRecording() {
    if (this.currentRecording && this.isRecording) {
      this.currentRecording.stop();
      this.isRecording = false;
      this.currentRecording = null;
    }
  }

  // Manual recording with user control
  startManualRecording(outputFile = "voice.wav") {
    return new Promise((resolve, reject) => {
      if (this.isRecording) {
        reject(new Error("Already recording"));
        return;
      }

      this.isRecording = true;

      try {
        const file = fs.createWriteStream(outputFile);
        const recording = record.record({
          sampleRate: 16000,
          threshold: 0.5,
          verbose: false,
          recordProgram: "rec",
          silence: "2.0s", // Stop after 2 seconds of silence
        });

        this.currentRecording = recording;
        recording.stream().pipe(file);

        console.log(
          "🎤 Recording started... (will auto-stop after 2 seconds of silence)"
        );
        console.log("Press Ctrl+C to stop manually");

        // Handle stream end (silence detected)
        recording.stream().on("end", () => {
          this.isRecording = false;
          console.log("🎤 Recording stopped (silence detected)");
          resolve(outputFile);
        });

        // Handle errors
        recording.stream().on("error", (error) => {
          this.isRecording = false;
          reject(error);
        });
      } catch (error) {
        this.isRecording = false;
        reject(error);
      }
    });
  }
}

module.exports = { VoiceRecordingService };
