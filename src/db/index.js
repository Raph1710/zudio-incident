const { Pool } = require('pg')
const dotenv = require('dotenv')

dotenv.config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // max connections — keep this low for now, we'll tune later
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err)
})

const originalQuery = pool.query.bind(pool)
pool.query = (text, params) => {
  return originalQuery(text, params)
}

module.exports = pool
