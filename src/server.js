require("dotenv").config();

// Fix for Node.js File global (required for OpenAI file uploads)
if (typeof globalThis.File === "undefined") {
  try {
    globalThis.File = require("node:buffer").File;
    console.log("✅ File global polyfill applied");
  } catch (error) {
    console.warn("⚠️ Could not apply File global polyfill:", error.message);
  }
}

const app = require("./app");

const PORT = process.env.PORT ;

app.listen(PORT, "::", () => {
  console.log(`Server listening on [::]${PORT}`);
});
