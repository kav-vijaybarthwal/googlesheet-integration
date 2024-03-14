const { google } = require('googleapis');
const dotenv = require("dotenv");
const drive = google.drive({ version: 'v3' });
const { OAuth2Client } = require('google-auth-library');
const jwt = require("jsonwebtoken");
const db = require("../dbConfig/db");

dotenv.config();

const CLIENT_ID = process.env.client_id;
const CLIENT_SECRET = process.env.client_secret;
const REDIRECT_URI = process.env.redirect_uris;
// procedure to connect multiple scopes/ values from env into array, to pass as arguments;
const SCOPES = process.env.scopes.split(",");

const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

exports.getRefreshToken = async (req, res, next) => {
  const query = `SELECT refresh_token FROM user_info WHERE user_id = $1`;
  const userId = req?.session?.userInfo?.sub;
  try {
    if (userId) {
      const getToken = await db.pool.query(query, [userId])
      req.session.refresh_token = getToken.rows[0].refresh_token;
      next()
    } else {
      next()
    }
  } catch (error) {
    next();
    console.log(error)
  }
}

const retriveuserInfo = async (token) => {
  const { id_token } = token;
  try {
    const userDetails = await jwt.decode(id_token);
    return userDetails;
  } catch (error) {
    console.log("Error in decoding token", error);
  }
}

const createNewUserInfoTable = async () => {
  const query = `CREATE TABLE IF NOT EXISTS user_info (
    id SERIAL,
    email VARCHAR(255),
    user_id VARCHAR(255) PRIMARY KEY,
    user_name VARCHAR(255),
    access_token VARCHAR(255),
    refresh_token VARCHAR(255),
    sheet_id VARCHAR(255),
    sheet_url VARCHAR(255),
    expiry_date VARCHAR(255)
    )`
  try {
    await db.pool.query(query)
  } catch (error) {
    return error
  }
}

const getAcceddTokenFromDB = async (token) => {
  const query = `SELECT access_token from user_info WHERE access_token = $1`;
  try {
    const getToken = await db.pool.query(query, [token]);
    if (getToken.rowCount) {
      return getToken.rows[0].access_token
    }
  } catch (error) {
    return error
  }
}

const createSheetTable = async () => {
  const query = `CREATE TABLE IF NOT EXISTS sheet_url (
    id SERIAL,
    sheet_name VARCHAR(255),
    user_id VARCHAR(255),
    sheet_id VARCHAR(255),
    sheet_link_url VARCHAR(255) PRIMARY KEY,
    FOREIGN KEY (user_id) REFERENCES user_info(user_id)
  )`
  try {
    await db.pool.query(query)
  } catch (error) {
    console.log("ERROR", error)
    return error
  }
}

const updateUrlOfSheet = async (sheetId, sheetName, userid, sheetURL) => {
  const getSheetIdQuery = `SELECT * FROM sheet_url WHERE sheet_id = $1`;
  const insertUrlLinkQuery = `INSERT INTO sheet_url (user_id, sheet_name, sheet_id, sheet_link_url) VALUES($1, $2, $3, $4)`
  try {
    const isUrlLinkExists = await db.pool.query(getSheetIdQuery, [sheetId])
    if (!isUrlLinkExists.rowCount) {
      const saveToDB = db.pool.query(insertUrlLinkQuery, [userid, sheetName, sheetId, sheetURL])
    }
  } catch (error) {
    console.log("ERROR in update URL", error)
  }
}

const saveDataToTable = async (tokens, userInfo) => {
  const {
    access_token,
    refresh_token,
    expiry_date
  } = tokens;
  const {
    email,
    name: user_name,
    sub: user_id
  } = userInfo;
  const refreshToken = refresh_token ?? null;
  const query = `INSERT INTO user_info (email, user_id, user_name, access_token, refresh_token, sheet_id, sheet_url, expiry_date)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (user_id) DO UPDATE
  SET email = $1, user_id = $2, user_name = $3, access_token = $4, refresh_token = $5, sheet_id = $6, sheet_url = $7, expiry_date = $8
  `
  const checkUserQuery = `SELECT * FROM user_info WHERE user_id = $1`;

  const updateUserQuery = `UPDATE user_info
  SET email = $1, user_name = $2, access_token = $3, 
  ${refreshToken ? 'refresh_token = $4,' : ''} 
  sheet_id = $5, sheet_url = $6, expiry_date = $7
  WHERE user_id = $8
  AND ($4 IS NOT NULL OR $4 IS NOT DISTINCT FROM refresh_token)
  `;
  try {
    const checkForUser = await db.pool.query(checkUserQuery, [user_id]);
    if (checkForUser.rows.length > 0) {
      await db.pool.query(updateUserQuery, refreshToken ?
        [email, user_name, access_token, refreshToken, null, null, expiry_date, user_id] :
        [email, user_name, access_token, null, null, expiry_date, user_id]
      );
    } else {
      await db.pool.query(query, [email, user_id, user_name, access_token, refreshToken, "", "", expiry_date])
    }
  } catch (error) {
    console.log("Error in saveig DATA into db", error)
  }

}

const appendValues = async (spreadsheetId, rows, res) => {
  const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Sheet1",
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: rows,
      },
    });
    console.log("Sheetp Append value response\n", rows, "\n", response.data)
    res.json(response.data);
  } catch (error) {
    if (error.errors.length) return res.json({ message: error?.errors[0]?.message ?? "Unexpected Error" })
    res.json(error)
  }
}

const isTokenExpired = (expiryDate) => {
  const now = new Date().getTime();
  return !expiryDate || now >= expiryDate;
}

const refreshToken = async (req, res) => {
  const { refresh_token: refToken, } = req.userTokenInfo;
  oAuth2Client.setCredentials({ refresh_token: refToken })
  try {
    const { credentials } = await oAuth2Client.refreshAccessToken();
    const newAccessToken = credentials.access_token;

    oAuth2Client.setCredentials({
      access_token: newAccessToken,
      refresh_token: refToken,
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
  const { expiry_date } = req.userTokenInfo;
  try {
    if (isTokenExpired(expiry_date)) {
      await refreshToken(req, res);
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error----' });
  }
};

exports.loginPageController = async (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  res.redirect(authUrl);
}

exports.oAuthCallBack = async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oAuth2Client.getToken(code);
  const userInfo = await retriveuserInfo(tokens)
  await createNewUserInfoTable();
  if (!tokens) return res.status(500).send('Failed to retrieve tokens');
  req.session.userInfo = userInfo;
  req.session.access_token = tokens.access_token;
  oAuth2Client.setCredentials(tokens);
  const tockenQueryString = Object.keys(tokens).map(key => `${key}=${tokens[key]}`).join("&")
  setTimeout(async () => {
    await saveDataToTable(tokens, userInfo)
  }, 1000)
  res.redirect(`/initiate-integration`);

}
const getUserInfoFromTable = async (id) => {
  const getTokenQuery = `
    SELECT ui.access_token, ui.refresh_token, ui.user_id, ui.expiry_date
    FROM user_info ui
    INNER JOIN sheet_url su ON ui.user_id = su.user_id
    WHERE su.sheet_id = $1
    `
  try {
    const userInfo = await db.pool.query(getTokenQuery, [id]);
    return userInfo
  } catch (error) {
    return error
  }
}

exports.getTokenFromSheetId = async (req, res, next) => {
  const { id } = req.params;
  try {
    const getUser = await getUserInfoFromTable(id)
    if (getUser.rowCount) {
      req.userTokenInfo = getUser?.rows[0];
      next();
    }
  } catch (error) {
    res.status(400).json({ error: "Provided sheet does not belog to any of the user, link sheet again" })
  }
}

exports.postDataIntoFile = async (req, res) => {
  const { id } = req.params;
  const { access_token: header_access_token } = req.headers;
  const isTokenPresent = await getAcceddTokenFromDB(header_access_token);

  try {
    const payload = Object.values(req.body);

    console.log("=======PAYLOAD RECEIVED========\n", req.body, "\n=======PAYLOAD RECEIVED========")

    if (isTokenPresent === header_access_token) {
      await appendValues(id, [payload], res)
    } else {
      throw new Error("access token not valid");
    }

  } catch (error) {
    console.error("Error in reading file", error);
    if (error.message === "access token not valid") {
      res.status(401).json({ error: 'Access token not valid' });
    } else {
      res.status(500).json({ error: 'Internal Server Error++++' });
    }
  }
}

exports.getSpreadsheetList = async (req, res) => {
  try {
    const files = await listSpreadsheets();
    res.render("SpreadSheetList", { sheetUrls: [], files })

  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

exports.getIntegrationConfirmation = (req, res) => {
  res.render("InitiateIntegration")
}

exports.generateSheetUrl = async (req, res) => {
  const { fileId, sheetName, sheetURL } = req.body;
  const { sub: userId } = req?.session?.userInfo;
  await createSheetTable();
  try {
    const isUrlSaved = await updateUrlOfSheet(fileId, sheetName, userId, sheetURL);
    if (!isUrlSaved.rowCount) {
      res.status(200).json({ message: "Data saved sucessfully" })
    }

  } catch (error) {
    res.status(404).json({ error })
  }
}

exports.getExistingIntegration = async (req, res) => {
  res.render("InitiateIntegration")
}

exports.listExistingIntegration = async (req, res) => {
  const { sub: user_id } = req?.session?.userInfo;
  const query = `SELECT * FROM sheet_url WHERE user_id = $1`
  try {
    const urlList = await db.pool.query(query, [user_id]);
    if ((urlList).rowCount > 0) {
      const { rows } = urlList;
      res.render("SpreadSheetList", { sheetUrls: rows, files: [] })
    } else {
      res.status(200).json({ message: "No record Found" })
    }
  } catch (error) {
    res.status(400).json({ error })
  }
}