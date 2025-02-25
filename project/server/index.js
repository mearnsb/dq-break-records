// @ts-check
import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve path to .env file
dotenv.config({ path: resolve(__dirname, '../.env') });

console.log('Database Configuration:', {
  host: process.env.DATABASE_URL,
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USERNAME,
  tenant: process.env.DATABASE_TENANT
});

const app = express();
const { Pool } = pg;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

const pool = new Pool({
  host: process.env.DATABASE_URL,
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  port: 5432,
  // Increase timeouts
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  ssl: {
    rejectUnauthorized: false,
    requestCert: true
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  if (client) {
    client.release(true); // Force release with error
  }
});

async function executeWithRetry(operation) {
  let lastError;
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${i + 1} failed, retrying in ${RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }
  
  throw lastError;
}

app.get('/api/health', async (req, res) => {
  try {
    await executeWithRetry(async () => {
      const client = await pool.connect();
      try {
        if (process.env.DATABASE_TENANT) {
          await client.query(`SET search_path TO ${process.env.DATABASE_TENANT}`);
        }
        
        const result = await client.query('SELECT NOW()');
        console.log(`Successfully connected to database at ${process.env.DATABASE_URL}`);
        
        if (result.rows.length > 0) {
          return res.json({ status: 'connected' });
        }
        throw new Error('Database query returned no results');
      } finally {
        client.release();
      }
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: `Failed to connect to database after ${MAX_RETRIES} attempts: ${error.message}` 
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});