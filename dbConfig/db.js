const { Pool } = require("pg");

const dbConnectionString = "postgres://mkto_google_user:rTgTI9nYwsGpEXu5TI3BosbDIS8Y9Nmc@dpg-cnn8ikv109ks73fvfr4g-a.singapore-postgres.render.com/mkto_google";

const pool = new Pool({
  connectionString: dbConnectionString,
  ssl: {
    rejectUnauthorized: false
  }
})

const checkDbConnectivity = async () => {
  try {
    const client = await pool.connect();
    console.log("Databse is connected successfully");
    client.release();
  } catch (error) {
    console.log(`Error in connecting Database ${error}`)
  }
}

module.exports = { pool, checkDbConnectivity }