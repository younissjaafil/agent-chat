const crypto = require("crypto");

class EncryptionService {
  constructor() {
    // Use environment variable for encryption key or generate a default one
    // In production, this should always come from environment variables
    this.encryptionKey =
      process.env.ENCRYPTION_KEY || this.generateDefaultKey();
    this.algorithm = "aes-256-cbc";
  }

  // Generate a default key for development (should use env var in production)
  generateDefaultKey() {
    console.warn(
      "⚠️  Using default encryption key. Set ENCRYPTION_KEY environment variable for production."
    );
    return crypto.scryptSync("chai-app-default-key", "salt", 32);
  }

  // Encrypt text
  encrypt(text) {
    try {
      if (!text || typeof text !== "string") {
        throw new Error("Text must be a non-empty string");
      }

      // Generate a random initialization vector
      const iv = crypto.randomBytes(16);

      // Create cipher
      const cipher = crypto.createCipheriv(
        this.algorithm,
        this.encryptionKey,
        iv
      );

      // Encrypt the text
      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      // Return the iv and encrypted data as a combined string
      return iv.toString("hex") + ":" + encrypted;
    } catch (error) {
      console.error("Encryption error:", error);
      throw new Error("Failed to encrypt message");
    }
  }

  // Decrypt text
  decrypt(encryptedText) {
    try {
      if (!encryptedText || typeof encryptedText !== "string") {
        throw new Error("Encrypted text must be a non-empty string");
      }

      // Split the encrypted string to get iv and encrypted data
      const parts = encryptedText.split(":");
      if (parts.length !== 2) {
        throw new Error("Invalid encrypted text format");
      }

      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        iv
      );

      // Decrypt the text
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      console.error("Decryption error:", error);
      throw new Error("Failed to decrypt message");
    }
  }

  // Check if text appears to be encrypted (simple heuristic)
  isEncrypted(text) {
    if (!text || typeof text !== "string") {
      return false;
    }

    // Check if it has the expected format: hex:hex
    const parts = text.split(":");
    if (parts.length !== 2) {
      return false;
    }

    // Check if all parts are hexadecimal
    const hexPattern = /^[0-9a-f]+$/i;
    return parts.every((part) => hexPattern.test(part));
  }

  // Utility method to generate a new encryption key
  static generateEncryptionKey() {
    return crypto.randomBytes(32).toString("hex");
  }
}

module.exports = EncryptionService;
