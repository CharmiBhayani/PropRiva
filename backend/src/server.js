const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const app = require("./app");

app.listen(5000, () => {
  console.log("Server running on port 5000");
});