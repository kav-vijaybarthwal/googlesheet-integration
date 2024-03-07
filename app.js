const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");


const {
  loginPageController,
  oAuthCallBack,
  postDataIntoFile,
  getSpreadsheetList,
  getIntegrationConfirmation,
  tokenMiddleware
} = require("./controller/googleApiController");

dotenv.config();

const PORT = process.env.PORT || 9000;
const app = express();
app.use(cors())
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "5mb" }))
app.use(tokenMiddleware);

app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

app.get("/", (req, res) => {
  res.render("LoginPage")
})




// Google OAuth login route
app.get('/login', loginPageController);

// Call back url, gets code from url, and then request for token
app.get("/oauth2callback", oAuthCallBack)

app.get("/list-spreadsheets", getSpreadsheetList)
app.get("/initiate-integration", getIntegrationConfirmation)



app.post('/files/:id', postDataIntoFile);

app.listen(PORT, () => console.log(`Server at http://localhost:${PORT}`))