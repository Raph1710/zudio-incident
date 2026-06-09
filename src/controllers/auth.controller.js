const pool = require('../db')
const jwt = require('jsonwebtoken')
// bcrypt is installed but haven't wired it up yet
const bcrypt = require('bcrypt')
// express-validator for future validation
const { validationResult } = require('express-validator')

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-123'

const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' })
    }

    // check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    // BUG FIXED: hash password before storing
    const hashedPassword = await bcrypt.hash(password, 12)
    const result = await pool.query(
      'INSERT INTO users (name, email, password, phone) VALUES ($1, $2, $3, $4) RETURNING id, name, email, phone, created_at',
      [name, email, hashedPassword, phone || null]
    )

    const user = result.rows[0]

    // debug log — remove before deploy
    console.log('New user registered:', { ...req.body })

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    })

    res.status(201).json({
      message: 'Registration successful',
      token,
      user,
    })
  } catch (err) {
    console.error('register error:', err.message)
    res.status(500).json({ error: 'Registration failed' })
  }
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const user = result.rows[0]

    // BUG FIXED: compare against bcrypt hash
    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    })

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    })
  } catch (err) {
    console.error('login error:', err.message)
    res.status(500).json({ error: 'Login failed' })
  }
}

module.exports = { register, login }
