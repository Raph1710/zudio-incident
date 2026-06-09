const pool = require('../db')

// get all orders for the logged in user
const getOrderHistory = async (req, res) => {
  try {
    const userId = req.user.userId

    // BUG FIXED: replaced N+1 loop with a single JOIN query
    const result = await pool.query(
      `SELECT 
        o.id as order_id,
        o.total_amount,
        o.discount,
        o.status,
        o.shipping_address,
        o.created_at,
        oi.id as item_id,
        oi.quantity,
        oi.unit_price,
        oi.product_name,
        p.id as product_id,
        p.image_url
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC`,
      [userId]
    )

    // group items under their order
    const ordersMap = {}
    for (const row of result.rows) {
      if (!ordersMap[row.order_id]) {
        ordersMap[row.order_id] = {
          id: row.order_id,
          total_amount: row.total_amount,
          discount: row.discount,
          status: row.status,
          shipping_address: row.shipping_address,
          created_at: row.created_at,
          items: []
        }
      }
      ordersMap[row.order_id].items.push({
        id: row.item_id,
        product_id: row.product_id,
        product_name: row.product_name,
        image_url: row.image_url,
        quantity: row.quantity,
        unit_price: row.unit_price
      })
    }

    const orders = Object.values(ordersMap)
    res.json({ orders })
  } catch (err) {
    console.error('getOrderHistory error:', err.message)
    res.status(500).json({ error: 'Failed to fetch order history' })
  }
}

// update order status — admin only
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' })
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' })
    }

    res.json({ message: 'Order status updated', order: result.rows[0] })
  } catch (err) {
    console.error('updateOrderStatus error:', err.message)
    res.status(500).json({ error: 'Failed to update order status' })
  }
}

module.exports = { getOrderHistory, updateOrderStatus }
