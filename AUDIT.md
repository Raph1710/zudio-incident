# Zudio Incident — Audit Report

## Profiling Table (Before Fixes)

| Endpoint                        | Response Time | Query Count | Observation                        |
|---------------------------------|---------------|-------------|------------------------------------|
| GET /api/products               | ~320ms        | 1           | Working, acceptable                |
| GET /api/products?search=shirt  | ~280ms        | 1           | SQL injection vulnerable           |
| GET /api/orders/history         | ~14000ms      | 200+        | N+1 detected, effectively unusable |
| POST /api/cart/checkout         | ~890ms        | 3           | Stock never decrements             |

---

## Bug 1: SQL Injection

**Severity:** CRITICAL  
**File:** src/controllers/product.controller.js  
**Line:** 13  

**Root Cause:**
User input from req.query.search was concatenated directly into a SQL 
string. An attacker can send malicious SQL and read or destroy the database.

**Reproduction Steps:**
1. GET /api/products?search=shirt' OR '1'='1
2. Without fix: returns all products
3. With fix: returns only literal matches

**Affected Users / Impact:**
Every user who uses the search bar. Attacker can dump entire database.

**Fix Applied:**
Replaced string concatenation with parameterised query using $1 placeholder.

Before:

```javascript
const query = `SELECT * FROM products WHERE name LIKE '%${req.query.search}%'`
```
After:

```javascript
result = await pool.query(
  'SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.name ILIKE $1 LIMIT $2 OFFSET $3',
  [`%${search}%`, parseInt(limit), parseInt(offset)]
)
```

---

## Bug 2: Plaintext Password Storage

**Severity:** CRITICAL  
**File:** src/controllers/auth.controller.js  
**Line:** 8  

**Root Cause:**
bcrypt was installed but commented out. Passwords were stored and compared 
as plain text. If the database is accessed, all passwords are immediately visible.

**Reproduction Steps:**
1. POST /api/auth/register with any password
2. SELECT password FROM users WHERE email='test@test.com'
3. Without fix: shows plain text password
4. With fix: shows $2b$12$... bcrypt hash

**Affected Users / Impact:**
Every registered user. All passwords exposed if database is breached.

**Fix Applied:**
Uncommented bcrypt, added hash on register, compare on login.

---

## Bug 3: Double Discount Application

**Severity:** HIGH  
**File:** src/controllers/checkout.controller.js  
**Line:** 47  

**Root Cause:**
Coupon validation (SELECT) and marking as used (UPDATE) were two separate 
queries with no transaction. Two concurrent requests could both pass the 
SELECT check before either UPDATE ran, applying the discount twice.

**Reproduction Steps:**
1. POST /api/cart/checkout with couponCode: "FLAT50"
2. POST /api/cart/checkout with same couponCode immediately after
3. Without fix: discount applied twice
4. With fix: second request returns 400 "already used"

**Affected Users / Impact:**
Any customer using a coupon. Direct revenue loss on every affected order.

**Fix Applied:**
Replaced two-query pattern with single atomic UPDATE ... WHERE used = false RETURNING *.
If no row returned, coupon was already used.

---

## Bug 4: Stock Never Decrements

**Severity:** CRITICAL  
**File:** src/controllers/checkout.controller.js  
**Line:** 67  

**Root Cause:**
The stock update loop was commented out with a TODO annotation in both 
the coupon and no-coupon branches. Every purchase left stock unchanged.

**Reproduction Steps:**
1. GET /api/products — note stock for product 1 (20)
2. POST /api/cart/checkout with productId 1, quantity 2
3. GET /api/products — without fix stock still 20, with fix stock is 18

**Affected Users / Impact:**
Every customer. 100% of purchases. Enables unlimited overselling during sales.

**Fix Applied:**
Uncommented stock update loop and wrapped entire checkout in a BEGIN/COMMIT 
transaction. Added AND stock >= $1 check to prevent negative stock.

---

## Bug 5: N+1 Query in Order History

**Severity:** HIGH  
**File:** src/controllers/order.controller.js  
**Line:** 14  

**Root Cause:**
Nested loops issued a separate DB query for every order and every item 
within each order. For a user with 20 orders of 5 items each: 1 + (20x5) = 101 queries.

**Reproduction Steps:**
1. GET /api/orders/history
2. Watch terminal — without fix: 200+ queries, ~14 seconds
3. With fix: 1 query, ~50ms

**Affected Users / Impact:**
Every user who views order history. Page effectively unusable at scale.

**Fix Applied:**
Replaced nested loops with a single JOIN query across orders, order_items, 
and products. Results grouped in JavaScript after single DB round trip.