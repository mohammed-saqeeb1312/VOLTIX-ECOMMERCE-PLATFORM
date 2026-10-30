import jwt from 'jsonwebtoken'
export function signToken(user){return jwt.sign({id:user.id,email:user.email,role:user.role},process.env.JWT_SECRET,{expiresIn:'7d'})}
export function auth(req,res,next){
 const header=req.headers.authorization||''
 const token=header.startsWith('Bearer ')?header.slice(7):null
 if(!token)return res.status(401).json({error:'Please sign in to continue.'})
 try{req.user=jwt.verify(token,process.env.JWT_SECRET);next()}catch{return res.status(401).json({error:'Session expired. Please sign in again.'})}
}
export function admin(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({error:'Admin access required.'});next()}
