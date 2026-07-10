const { Pool } = require('pg');

let connectionString = process.env.DATABASE_URL;
if (connectionString && connectionString.includes('?')) {
  connectionString = connectionString.split('?')[0];
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

// Auto-initialize the schema on module load
async function initializeDatabase() {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      username VARCHAR(100) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      address TEXT NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      license_key VARCHAR(255) UNIQUE,
      machine_id VARCHAR(255),
      reset_token VARCHAR(255),
      reset_token_expires TIMESTAMP WITH TIME ZONE,
      last_login TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(query);
    // Alter existing tables to add last_login if missing
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;`);
    console.log('PostgreSQL database initialized successfully (and last_login column verified).');

    // Seed the default test user if not already present
    const testUsername = 'lidorbituser';
    const testEmail = 'user@lidorbit.com';
    const testPasswordHash = '$2b$10$C8G5ukiwJmx/Ybk5Ngs2MecyozMlsxaX7MOzgXXEmKsbvogOXhnji'; // Password123!
    const testLicenseKey = 'cs_test_LIDORBIT_TEST_LICENSE';

    const checkUser = await pool.query(
      'SELECT username FROM users WHERE username = $1 OR email = $2 OR license_key = $3',
      [testUsername, testEmail, testLicenseKey]
    );

    if (checkUser.rows.length === 0) {
      await pool.query(`
        INSERT INTO users (username, email, full_name, phone, address, password_hash, license_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [testUsername, testEmail, 'Lidorbit Test User', '1234567890', '123 Test Street', testPasswordHash, testLicenseKey]);
      console.log('Default test user lidorbituser seeded successfully.');
    }
  } catch (error) {
    console.error('Failed to initialize database table:', error);
  }
}

initializeDatabase();

function mapRowToUser(row) {
  if (!row) return null;
  return {
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    address: row.address,
    passwordHash: row.password_hash,
    licenseKey: row.license_key,
    machineId: row.machine_id,
    resetToken: row.reset_token,
    resetTokenExpires: row.reset_token_expires,
    lastLogin: row.last_login,
    createdAt: row.created_at
  };
}

async function findUserByUsername(username) {
  if (!username) return null;
  try {
    const res = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    return mapRowToUser(res.rows[0]);
  } catch (error) {
    console.error('Error in findUserByUsername:', error);
    return null;
  }
}

async function findUserByEmail(email) {
  if (!email) return null;
  try {
    const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    return mapRowToUser(res.rows[0]);
  } catch (error) {
    console.error('Error in findUserByEmail:', error);
    return null;
  }
}

async function findUserByLicenseKey(licenseKey) {
  if (!licenseKey) return null;
  try {
    const res = await pool.query('SELECT * FROM users WHERE license_key = $1', [licenseKey]);
    return mapRowToUser(res.rows[0]);
  } catch (error) {
    console.error('Error in findUserByLicenseKey:', error);
    return null;
  }
}

async function findUserByResetToken(token) {
  if (!token) return null;
  try {
    const res = await pool.query('SELECT * FROM users WHERE reset_token = $1', [token]);
    return mapRowToUser(res.rows[0]);
  } catch (error) {
    console.error('Error in findUserByResetToken:', error);
    return null;
  }
}

async function createUser(user) {
  const query = `
    INSERT INTO users (
      username, 
      email, 
      full_name, 
      phone, 
      address, 
      password_hash, 
      license_key, 
      machine_id, 
      reset_token, 
      reset_token_expires
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;
  const values = [
    user.username,
    user.email,
    user.fullName || '',
    user.phone || '',
    user.address || '',
    user.passwordHash,
    user.licenseKey || null,
    user.machineId || null,
    user.resetToken || null,
    user.resetTokenExpires || null
  ];

  try {
    const res = await pool.query(query, values);
    return mapRowToUser(res.rows[0]);
  } catch (error) {
    console.error('Error in createUser:', error);
    throw error;
  }
}

async function updateUser(username, updates) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return await findUserByUsername(username);

  const columnMapping = {
    username: 'username',
    email: 'email',
    fullName: 'full_name',
    phone: 'phone',
    address: 'address',
    passwordHash: 'password_hash',
    licenseKey: 'license_key',
    machineId: 'machine_id',
    resetToken: 'reset_token',
    resetTokenExpires: 'reset_token_expires',
    lastLogin: 'last_login'
  };

  const setClauses = [];
  const values = [];
  let index = 1;

  for (const key of keys) {
    const colName = columnMapping[key];
    if (colName) {
      setClauses.push(`${colName} = $${index}`);
      values.push(updates[key]);
      index++;
    }
  }

  values.push(username);
  const query = `
    UPDATE users 
    SET ${setClauses.join(', ')} 
    WHERE LOWER(username) = LOWER($${index})
    RETURNING *;
  `;

  try {
    const res = await pool.query(query, values);
    return mapRowToUser(res.rows[0]);
  } catch (error) {
    console.error('Error in updateUser:', error);
    throw error;
  }
}

module.exports = {
  findUserByUsername,
  findUserByEmail,
  findUserByLicenseKey,
  findUserByResetToken,
  createUser,
  updateUser,
  pool
};
