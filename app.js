const express = require("express");
const session = require('express-session');
const dotenv = require("dotenv");
const cors = require("cors");
const db = require("./dbConfig/db");

const {
  loginPageController,
  oAuthCallBack,
  postDataIntoFile,
  getSpreadsheetList,
  getIntegrationConfirmation,
  tokenMiddleware,
  getRefreshToken,
  generateSheetUrl,
  getExistingIntegration,
  listExistingIntegration
} = require("./controller/googleApiController");

dotenv.config();

const PORT = process.env.PORT || 9000;
const app = express();
app.use(session({
  secret: 'quick_brown_fox_jumbs_over_the_lazy_dog',
  resave: false,
  saveUninitialized: true,
}));
app.use(cors())
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "5mb" }))
app.use(tokenMiddleware);
app.use(getRefreshToken);

app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

app.get("/", (req, res) => {
  if (req?.session?.userInfo) {
    res.redirect("/initiate-integration")
  } else {
    res.render("LoginPage")
  }
})




// Google OAuth login route
app.get('/login', loginPageController);

// Call back url, gets code from url, and then request for token
app.get("/oauth2callback", oAuthCallBack)

app.get("/list-spreadsheets", getSpreadsheetList)
app.get("/list-existing-integration", listExistingIntegration)
app.get("/initiate-integration", getIntegrationConfirmation)
app.get("/existing-integration", getExistingIntegration)
app.post("/save-file-link", generateSheetUrl)

app.post('/files/:id', postDataIntoFile);

const startServer = async () => {
  try {
    await db.checkDbConnectivity()
    app.listen(PORT, () => console.log(`Server at http://localhost:${PORT}`))
  } catch (error) {
    console.log('Error starting server:', error);
  }
}

startServer();
