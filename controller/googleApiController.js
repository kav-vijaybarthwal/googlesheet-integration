const { google } = require('googleapis');
const dotenv = require("dotenv");
const drive = google.drive({ version: 'v3' });
const { OAuth2Client } = require('google-auth-library');

dotenv.config();

const CLIENT_ID = process.env.client_id;
const CLIENT_SECRET = process.env.client_secret;
const REDIRECT_URI = process.env.redirect_uris;
const SCOPES = process.env.scopes.split(",");
console.log("SCOPES", SCOPES)
const REFRESH_TOKEN = process.env.refresh_token;

const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);



const appendValues = async (spreadsheetId, rangeToAppend, rows, res) => {
  const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: rangeToAppend,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: rows,
      },
    });
    res.json(response.data);
  } catch (error) {
    if (error.errors.length) return res.json({ message: error?.errors[0]?.message ?? "Unexpected Error" })
    res.json(error)
  }
}

const isTokenExpired = () => {
  const now = new Date().getTime();
  const expiryDate = oAuth2Client?.credentials?.expiry_date;

  return !expiryDate || now >= expiryDate;
}

const refreshToken = async (res) => {
  oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN })
  try {
    const { credentials } = await oAuth2Client.refreshAccessToken();
    const newAccessToken = credentials.access_token;

    console.log('New Access Token:', credentials);
    oAuth2Client.setCredentials({
      access_token: newAccessToken,
      refresh_token: REFRESH_TOKEN,
      expiry_date: credentials.expiry_date,
      token_type: credentials.token_type,
    });
  } catch (error) {
    console.error('Error refreshing access token:', error.message);
  }
}

const listSpreadsheets = async () => {
  try {
    // List files with mimeType 'application/vnd.google-apps.spreadsheet'
    const driveResponse = await drive.files.list({
      auth: oAuth2Client,
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
    });

    const { files } = driveResponse.data;
    return files;
  } catch (error) {
    throw new Error('Error listing spreadsheets');
  }
}

exports.tokenMiddleware = async (req, res, next) => {
  try {
    if (isTokenExpired()) {
      await refreshToken(res);
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error----' });
  }
};

exports.loginPageController = (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  res.redirect(authUrl);
}

exports.oAuthCallBack = async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oAuth2Client.getToken(code);
  if (!tokens) return res.status(500).send('Failed to retrieve tokens');
  oAuth2Client.setCredentials(tokens);
  const tockenQueryString = Object.keys(tokens).map(key => `${key}=${tokens[key]}`).join("&")
  // res.redirect(`/list-spreadsheets?${tockenQueryString}`);
  console.log("TOKEN == ", tokens)
  res.redirect(`/initiate-integration?${tockenQueryString}`);
  // res.send('Login successful! You can now use the API.');
}



exports.postDataIntoFile = async (req, res) => {
  const { req_file_name: reqFileName, range } = req.query;
  const { rows } = req.body;
  const { id } = req.params;
  try {

    // const response = await drive.files.list({
    //   auth: oAuth2Client,
    //   q: "mimeType='application/vnd.google-apps.spreadsheet'",
    // });
    // const files = response?.data?.files;

    // const isRequestedFileExist = files.filter(item => item.name === reqFileName)
    // if (!isRequestedFileExist.length) return res.json({ message: "Requested file does not exist" })

    // const requestedFileId = isRequestedFileExist[0]?.id
    // if (!range) return res.status(400).json({ message: "Range is required" })

    await appendValues(id, range, rows, res)

  } catch (error) {
    console.error("Error in reading file", error);
    res.status(500).json({ error: 'Internal Server Error++++' });
  }
}

exports.getSpreadsheetList = async (req, res) => {
  try {
    const files = await listSpreadsheets();
    res.render("SpreadSheetList", { files })

  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

exports.getIntegrationConfirmation = (req, res) => {
  res.render("InitiateIntegration")
}


