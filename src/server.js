require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 1001;

app.listen(PORT, "::", () => {
  console.log(`Server listening on [::]${PORT}`);
});
