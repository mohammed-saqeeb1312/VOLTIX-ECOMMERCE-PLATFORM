import initSqlJs from 'sql.js'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const here=path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DB_DIR
  ? path.resolve(process.env.DB_DIR)
  : path.resolve(here, '../data')
const dbFile=path.join(dataDir,'voltix.sqlite')
fs.mkdirSync(dataDir,{recursive:true})

function makeAdapter(native){
 let transactionDepth=0
 const persist=()=>{if(transactionDepth===0)fs.writeFileSync(dbFile,Buffer.from(native.export()))}
 const bindArgs=(sql,args)=>{
  if(args.length===1&&args[0]&&typeof args[0]==='object'&&!Array.isArray(args[0])){
   const obj=args[0]
   const keys=[...sql.matchAll(/[@:$]([A-Za-z_][A-Za-z0-9_]*)/g)].map(m=>m[0])
   return keys.map(k=>obj[k]??obj[k.slice(1)])
  }
  return args
 }
 const adapter={
  exec(sql){native.exec(sql);persist();},
  pragma(){return null},
  prepare(sql){return {
   get(...args){const st=native.prepare(sql);try{st.bind(bindArgs(sql,args));return st.step()?st.getAsObject():undefined}finally{st.free()}},
   all(...args){const st=native.prepare(sql),out=[];try{st.bind(bindArgs(sql,args));while(st.step())out.push(st.getAsObject());return out}finally{st.free()}},
   run(...args){const st=native.prepare(sql);try{st.bind(bindArgs(sql,args));st.step();const changes=native.getRowsModified();const id=native.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0]??0;persist();return {changes,lastInsertRowid:id}}finally{st.free()}}
  }},
  transaction(fn){return (...args)=>{native.run('BEGIN IMMEDIATE');transactionDepth++;try{const result=fn(...args);native.run('COMMIT');transactionDepth--;persist();return result}catch(e){native.run('ROLLBACK');transactionDepth--;throw e}}},
  close(){persist();native.close()}
 }
 return adapter
}
export async function createDatabase(){
 const SQL=await initSqlJs()
 const native=fs.existsSync(dbFile)?new SQL.Database(new Uint8Array(fs.readFileSync(dbFile))):new SQL.Database()
 native.run('PRAGMA foreign_keys=ON')
 const db=makeAdapter(native)
 db.exec(`
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,brand TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL,mrp INTEGER NOT NULL,rating REAL NOT NULL,reviews INTEGER NOT NULL,stock INTEGER NOT NULL,image TEXT NOT NULL,discount INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
 CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
 CREATE TABLE IF NOT EXISTS carts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,product_id INTEGER NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL CHECK(quantity>0),UNIQUE(user_id,product_id));
 CREATE TABLE IF NOT EXISTS wishlists(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,product_id INTEGER NOT NULL REFERENCES products(id),created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,product_id));
 CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'Placed',shipping_name TEXT NOT NULL,shipping_phone TEXT NOT NULL,shipping_address TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,product_id INTEGER NOT NULL REFERENCES products(id),product_name TEXT NOT NULL,price INTEGER NOT NULL,quantity INTEGER NOT NULL);
 `)
 return db
}
