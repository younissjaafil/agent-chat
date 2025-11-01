require("dotenv").config();
const AWS = require("aws-sdk");
const pdf = require("pdf-parse");

class KnowledgeBaseService {
  constructor() {
    // Configure AWS SDK for Selectel Cloud S3
    this.s3 = new AWS.S3({
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      endpoint: process.env.S3_ENDPOINT_URL,
      region: process.env.S3_REGION,
      s3ForcePathStyle: true,
      signatureVersion: "v4",
    });

    this.bucketName = process.env.S3_BUCKET_NAME;
    this.cache = new Map(); // Simple in-memory cache
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  // Search for relevant knowledge files based on query
  async searchKnowledgeFiles(query, asid = null) {
    try {
      console.log(`🔍 Searching knowledge base for: "${query}"`);

      // Build search prefix based on asid (e.g., "CR8/")
      const prefix = asid
        ? `${asid.replace("asid_", "").replace(/_.*/g, "")}/`
        : "";

      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: 100,
      };

      const objects = await this.s3.listObjectsV2(listParams).promise();

      if (!objects.Contents || objects.Contents.length === 0) {
        console.log(`📭 No files found with prefix: ${prefix}`);
        return [];
      }

      // Filter files that might be relevant to the query
      const relevantFiles = objects.Contents.filter((obj) => {
        const key = obj.Key.toLowerCase();
        const queryLower = query.toLowerCase();

        // Check if filename or path contains query terms
        const queryTerms = queryLower
          .split(" ")
          .filter((term) => term.length > 2);

        return queryTerms.some(
          (term) =>
            key.includes(term) ||
            key.includes("resume") ||
            key.includes("cv") ||
            key.includes("profile") ||
            key.includes("bio")
        );
      });

      console.log(`📚 Found ${relevantFiles.length} relevant files`);
      return relevantFiles;
    } catch (error) {
      console.error("❌ Error searching knowledge files:", error);
      return [];
    }
  }

  // Extract text content from various file types
  async extractFileContent(fileKey) {
    try {
      // Check cache first
      const cacheKey = `content_${fileKey}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`📄 Using cached content for: ${fileKey}`);
        return cached.content;
      }

      console.log(`📥 Downloading file: ${fileKey}`);

      const fileData = await this.s3
        .getObject({
          Bucket: this.bucketName,
          Key: fileKey,
        })
        .promise();

      let textContent = "";
      const fileExtension = fileKey.toLowerCase().split(".").pop();

      switch (fileExtension) {
        case "pdf":
          const pdfData = await pdf(fileData.Body);
          textContent = pdfData.text;
          break;

        case "txt":
        case "md":
        case "json":
          textContent = fileData.Body.toString("utf-8");
          break;

        default:
          // Try to read as text anyway
          try {
            textContent = fileData.Body.toString("utf-8");
          } catch (e) {
            textContent = `[Content from ${fileKey} - ${fileExtension} file, ${fileData.ContentLength} bytes]`;
          }
      }

      // Cache the content
      this.cache.set(cacheKey, {
        content: textContent,
        timestamp: Date.now(),
      });

      console.log(
        `✅ Extracted ${textContent.length} characters from ${fileKey}`
      );
      return textContent;
    } catch (error) {
      console.error(`❌ Error extracting content from ${fileKey}:`, error);
      return null;
    }
  }

  // Get relevant knowledge for a query
  async getKnowledgeForQuery(query, asid = null, maxFiles = 3) {
    try {
      console.log(`🧠 Getting knowledge for query: "${query}" (asid: ${asid})`);

      // Search for relevant files
      const relevantFiles = await this.searchKnowledgeFiles(query, asid);

      if (relevantFiles.length === 0) {
        return {
          found: false,
          message: "No relevant knowledge found in the knowledge base",
          sources: [],
        };
      }

      // Sort by relevance (size, date, etc.) and take top files
      const topFiles = relevantFiles
        .sort((a, b) => {
          // Prioritize by name relevance, then by size, then by date
          const aRelevance = this.calculateRelevance(a.Key, query);
          const bRelevance = this.calculateRelevance(b.Key, query);

          if (aRelevance !== bRelevance) return bRelevance - aRelevance;
          if (a.Size !== b.Size) return b.Size - a.Size;
          return new Date(b.LastModified) - new Date(a.LastModified);
        })
        .slice(0, maxFiles);

      // Extract content from top files
      const knowledgeContent = [];
      const sources = [];

      for (const file of topFiles) {
        const content = await this.extractFileContent(file.Key);
        if (content) {
          knowledgeContent.push({
            file: file.Key,
            content: content,
            size: file.Size,
            modified: file.LastModified,
          });

          sources.push({
            file: file.Key,
            url: `${process.env.S3_BUCKET_PUBLIC_URL}/${file.Key}`,
            size: file.Size,
            modified: file.LastModified,
          });
        }
      }

      if (knowledgeContent.length === 0) {
        return {
          found: false,
          message: "Could not extract content from knowledge files",
          sources: sources,
        };
      }

      // Combine all content
      const combinedContent = knowledgeContent
        .map((item) => `=== From ${item.file} ===\n${item.content}`)
        .join("\n\n");

      return {
        found: true,
        content: combinedContent,
        sources: sources,
        fileCount: knowledgeContent.length,
      };
    } catch (error) {
      console.error("❌ Error getting knowledge for query:", error);
      return {
        found: false,
        message: "Error accessing knowledge base",
        error: error.message,
        sources: [],
      };
    }
  }

  // Calculate relevance score for a file based on query
  calculateRelevance(fileName, query) {
    const fileNameLower = fileName.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(" ").filter((term) => term.length > 2);

    let score = 0;

    // Exact filename match
    if (fileNameLower.includes(queryLower)) score += 10;

    // Individual term matches
    queryTerms.forEach((term) => {
      if (fileNameLower.includes(term)) score += 3;
    });

    // Bonus for common knowledge file indicators
    if (fileNameLower.includes("resume")) score += 5;
    if (fileNameLower.includes("cv")) score += 5;
    if (fileNameLower.includes("profile")) score += 3;
    if (fileNameLower.includes("bio")) score += 3;

    return score;
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    console.log("🗑️ Knowledge base cache cleared");
  }

  // Get cache statistics
  getCacheStats() {
    return {
      entries: this.cache.size,
      memoryUsage: JSON.stringify([...this.cache.entries()]).length,
    };
  }
}

module.exports = KnowledgeBaseService;
