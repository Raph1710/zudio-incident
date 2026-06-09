const pool = require('../db')
// express-validator imported for request validation — TODO: wire up later
const { validationResult } = require('express-validator')

// get all products with optional category filter and search
const getProducts = async (req, res) => {
  try {
    const { category, search, limit = 20, offset = 0 } = req.query

    let result

    if (search) {
  // BUG FIXED: SQL injection — now using parameterised query
  result = await pool.query(
    'SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.name ILIKE $1 LIMIT $2 OFFSET $3',
    [`%${search}%`, parseInt(limit), parseInt(offset)]
  )
} else if (category) {
      result = await pool.query(
        'SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE c.name = $1 LIMIT $2 OFFSET $3',
        [category, parseInt(limit), parseInt(offset)]
      )
    } else {
      result = await pool.query(
        'SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2',
        [parseInt(limit), parseInt(offset)]
      )
    }

    res.json({
      products: result.rows,
      count: result.rows.length,
    })
  } catch (err) {
    console.error('getProducts error:', err.message)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
}

// get single product by id
const getProductById = async (req, res) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      'SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.id = $1',
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error('getProductById error:', err.message)
    res.status(500).json({ error: 'Failed to fetch product' })
  }
}

module.exports = { getProducts, getProductById }
