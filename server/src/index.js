import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import {createDatabase} from './db.js'
import {seedProducts} from './seed.js'
import {categories} from './taxonomy.js'
import {auth,admin,signToken} from './auth.js'

const PORT=Number(process.env.PORT)||5000
const JWT_SECRET=process.env.JWT_SECRET
if(!JWT_SECRET||JWT_SECRET.length<32){console.error('Set JWT_SECRET to a random value of at least 32 characters in server/.env');process.exit(1)}
const db=await createDatabase()
const seeded=seedProducts(db)
console.log(`Database ready: ${seeded} products`)
const app=express()
app.disable('x-powered-by')
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'}}))
app.use(cors({origin:(process.env.CLIENT_ORIGIN||'http://localhost:5173').split(',').map(x=>x.trim())}))
app.use(express.json({limit:'1mb'}))
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false}))
app.use('/api',rateLimit({windowMs:60*1000,limit:240,standardHeaders:true,legacyHeaders:false}))
const emailOk=v=>typeof v==='string'&&/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)
const publicUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role})
const productSelect='id,name,brand,category,price,mrp,rating,reviews,stock,image,discount'
app.get('/api/health',(req,res)=>res.json({ok:true,service:'VOLTIX API',database:'connected',products:db.prepare('SELECT COUNT(*) n FROM products').get().n}))
app.get('/api/categories',(req,res)=>res.json(categories.map(c=>({...c,count:db.prepare('SELECT COUNT(*) n FROM products WHERE category=?').get(c.name).n}))))
app.get('/api/products',(req,res)=>{
 const page=Math.max(1,parseInt(req.query.page)||1),limit=Math.min(60,Math.max(1,parseInt(req.query.limit)||24))
 const q=String(req.query.q||'').slice(0,100),category=String(req.query.category||'').slice(0,60),sort=String(req.query.sort||'featured')
 const where=[],params=[]
 if(q){where.push('(name LIKE ? OR brand LIKE ?)');params.push(`%${q}%`,`%${q}%`)}
 if(category){where.push('category=?');params.push(category)}
 const clause=where.length?' WHERE '+where.join(' AND '):''
 const order=sort==='price-asc'?'price ASC':sort==='price-desc'?'price DESC':sort==='rating'?'rating DESC':'id ASC'
 const total=db.prepare(`SELECT COUNT(*) n FROM products${clause}`).get(...params).n
 const items=db.prepare(`SELECT ${productSelect} FROM products${clause} ORDER BY ${order},id ASC LIMIT ? OFFSET ?`).all(...params,limit,(page-1)*limit)
 res.json({items,pagination:{page,limit,total,pages:Math.ceil(total/limit)}})
})
app.get('/api/products/:id',(req,res)=>{const p=db.prepare(`SELECT ${productSelect} FROM products WHERE id=?`).get(Number(req.params.id));if(!p)return res.status(404).json({error:'Product not found'});res.json(p)})
app.post('/api/auth/register',async(req,res)=>{
 const {name,email,password}=req.body||{}
 if(typeof name!=='string'||name.trim().length<2||name.length>70||!emailOk(email)||typeof password!=='string'||password.length<8||password.length>100)return res.status(400).json({error:'Enter a valid name, email and password (8–100 characters).'})
 try{const hash=await bcrypt.hash(password,12);const info=db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name.trim(),email.toLowerCase(),hash);const user=db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);res.status(201).json({token:signToken(user),user:publicUser(user)})}catch(e){if(String(e).includes('UNIQUE'))return res.status(409).json({error:'An account with this email already exists.'});res.status(500).json({error:'Could not create account.'})}
})
app.post('/api/auth/login',async(req,res)=>{
 const {email,password}=req.body||{};if(!emailOk(email)||typeof password!=='string')return res.status(400).json({error:'Enter your email and password.'})
 const user=db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase());if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({error:'Incorrect email or password.'})
 res.json({token:signToken(user),user:publicUser(user)})
})
app.get('/api/auth/me',auth,(req,res)=>{const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);if(!u)return res.status(401).json({error:'Account not found'});res.json(publicUser(u))})
app.get('/api/cart',auth,(req,res)=>res.json(db.prepare('SELECT c.quantity,p.* FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=? ORDER BY c.id DESC').all(req.user.id)))
app.post('/api/cart',auth,(req,res)=>{
 const productId=Number(req.body.productId),quantity=Math.max(1,Math.min(99,Number(req.body.quantity)||1))
 const p=db.prepare('SELECT id,stock FROM products WHERE id=?').get(productId);if(!p)return res.status(404).json({error:'Product not found'})
 const existing=db.prepare('SELECT quantity FROM carts WHERE user_id=? AND product_id=?').get(req.user.id,productId)
 if((existing?.quantity||0)+quantity>p.stock)return res.status(409).json({error:'Requested quantity exceeds available stock'})
 db.prepare('INSERT INTO carts(user_id,product_id,quantity) VALUES(?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=quantity+excluded.quantity').run(req.user.id,productId,quantity)
 res.json(db.prepare('SELECT c.quantity,p.* FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=? AND p.id=?').get(req.user.id,productId))
})
app.patch('/api/cart/:productId',auth,(req,res)=>{
 const qty=Number(req.body.quantity),pid=Number(req.params.productId)
 if(!Number.isInteger(qty)||qty<1||qty>99)return res.status(400).json({error:'Quantity must be between 1 and 99'})
 const p=db.prepare('SELECT stock FROM products WHERE id=?').get(pid);if(!p)return res.status(404).json({error:'Product not found'})
 if(qty>p.stock)return res.status(409).json({error:'Requested quantity exceeds stock'})
 const info=db.prepare('UPDATE carts SET quantity=? WHERE user_id=? AND product_id=?').run(qty,req.user.id,pid)
 if(!info.changes)return res.status(404).json({error:'Cart item not found'})
 res.json({ok:true})
})
app.delete('/api/cart/:productId',auth,(req,res)=>{db.prepare('DELETE FROM carts WHERE user_id=? AND product_id=?').run(req.user.id,Number(req.params.productId));res.json({ok:true})})
app.delete('/api/cart',auth,(req,res)=>{db.prepare('DELETE FROM carts WHERE user_id=?').run(req.user.id);res.json({ok:true})})
app.get('/api/wishlist',auth,(req,res)=>res.json(db.prepare('SELECT p.* FROM wishlists w JOIN products p ON p.id=w.product_id WHERE w.user_id=? ORDER BY w.created_at DESC').all(req.user.id)))
app.post('/api/wishlist/:productId',auth,(req,res)=>{const id=Number(req.params.productId);if(!db.prepare('SELECT id FROM products WHERE id=?').get(id))return res.status(404).json({error:'Product not found'});db.prepare('INSERT OR IGNORE INTO wishlists(user_id,product_id) VALUES(?,?)').run(req.user.id,id);res.json({ok:true})})
app.delete('/api/wishlist/:productId',auth,(req,res)=>{db.prepare('DELETE FROM wishlists WHERE user_id=? AND product_id=?').run(req.user.id,Number(req.params.productId));res.json({ok:true})})
app.post('/api/orders',auth,(req,res)=>{
 const {shippingName,shippingPhone,shippingAddress}=req.body||{}
 if(typeof shippingName!=='string'||shippingName.trim().length<2||!/^\\+?[0-9\\s-]{8,16}$/.test(shippingPhone||'')||typeof shippingAddress!=='string'||shippingAddress.trim().length<8)return res.status(400).json({error:'Enter complete shipping details and a valid phone number'})
 const tx=db.transaction(()=>{
  const items=db.prepare('SELECT c.quantity,p.id,p.name,p.price,p.stock FROM carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=?').all(req.user.id)
  if(!items.length)throw new Error('Your cart is empty')
  for(const i of items)if(i.quantity>i.stock)throw new Error(`${i.name} does not have enough stock`)
  const total=items.reduce((s,i)=>s+i.price*i.quantity,0)
  const info=db.prepare('INSERT INTO orders(user_id,total,shipping_name,shipping_phone,shipping_address) VALUES(?,?,?,?,?)').run(req.user.id,total,shippingName.trim(),shippingPhone,shippingAddress.trim())
  const ins=db.prepare('INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(?,?,?,?,?)')
  const stock=db.prepare('UPDATE products SET stock=stock-? WHERE id=?')
  for(const i of items){ins.run(info.lastInsertRowid,i.id,i.name,i.price,i.quantity);stock.run(i.quantity,i.id)}
  db.prepare('DELETE FROM carts WHERE user_id=?').run(req.user.id)
  return {id:info.lastInsertRowid,total,items:items.length,status:'Placed'}
 })
 try{res.status(201).json(tx())}catch(e){res.status(400).json({error:e.message||'Could not place order'})}
})
app.get('/api/orders',auth,(req,res)=>res.json(db.prepare('SELECT id,total,status,shipping_name,created_at FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id)))
app.get('/api/admin/summary',auth,admin,(req,res)=>res.json({products:db.prepare('SELECT COUNT(*) n FROM products').get().n,users:db.prepare('SELECT COUNT(*) n FROM users').get().n,orders:db.prepare('SELECT COUNT(*) n FROM orders').get().n,revenue:db.prepare('SELECT COALESCE(SUM(total),0) n FROM orders').get().n}))
app.get('/api/admin/products',auth,admin,(req,res)=>res.json(db.prepare(`SELECT ${productSelect} FROM products ORDER BY id DESC LIMIT 100`).all()))
app.post('/api/admin/products',auth,admin,(req,res)=>{
 const p=req.body||{}
 if(typeof p.name!=='string'||p.name.trim().length<2||typeof p.brand!=='string'||typeof p.category!=='string'||!Number.isFinite(Number(p.price))||Number(p.price)<1||!Number.isInteger(Number(p.stock))||Number(p.stock)<0)return res.status(400).json({error:'Enter valid product name, brand, category, price and stock'})
 const info=db.prepare('INSERT INTO products(name,brand,category,price,mrp,rating,reviews,stock,image,discount) VALUES(?,?,?,?,?,?,?,?,?,?)').run(p.name.trim(),p.brand.trim(),p.category,Number(p.price),Number(p.mrp)||Number(p.price),Number(p.rating)||4.2,0,Number(p.stock),p.image||'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=700&q=85',Number(p.discount)||0)
 res.status(201).json(db.prepare(`SELECT ${productSelect} FROM products WHERE id=?`).get(info.lastInsertRowid))
})
app.patch('/api/admin/products/:id',auth,admin,(req,res)=>{
 const p=req.body||{},id=Number(req.params.id)
 const old=db.prepare(`SELECT * FROM products WHERE id=?`).get(id);if(!old)return res.status(404).json({error:'Product not found'})
 const next={...old,...p}
 db.prepare('UPDATE products SET name=?,brand=?,category=?,price=?,mrp=?,stock=?,image=?,discount=? WHERE id=?').run(next.name,next.brand,next.category,Number(next.price),Number(next.mrp),Number(next.stock),next.image,Number(next.discount),id)
 res.json(db.prepare(`SELECT ${productSelect} FROM products WHERE id=?`).get(id))
})
app.delete('/api/admin/products/:id',auth,admin,(req,res)=>{
 const id=Number(req.params.id)
 const inOrder=db.prepare('SELECT COUNT(*) n FROM order_items WHERE product_id=?').get(id).n
 if(inOrder)return res.status(409).json({error:'This product belongs to an order and cannot be deleted; set stock to zero instead'})
 db.prepare('DELETE FROM carts WHERE product_id=?').run(id);db.prepare('DELETE FROM wishlists WHERE product_id=?').run(id)
 const result=db.prepare('DELETE FROM products WHERE id=?').run(id)
 res.json({ok:result.changes>0})
})
app.get('/api/admin/orders',auth,admin,(req,res)=>res.json(db.prepare('SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 200').all()))
app.patch('/api/admin/orders/:id',auth,admin,(req,res)=>{
 const status=String(req.body.status||'')
 if(!['Placed','Processing','Shipped','Delivered','Cancelled'].includes(status))return res.status(400).json({error:'Invalid order status'})
 const result=db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,Number(req.params.id))
 if(!result.changes)return res.status(404).json({error:'Order not found'})
 res.json({ok:true})
})
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'Unexpected server error'})})
app.listen(PORT,()=>console.log(`VOLTIX API running at http://localhost:${PORT}`))
