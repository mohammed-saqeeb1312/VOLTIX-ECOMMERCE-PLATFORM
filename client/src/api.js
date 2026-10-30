const API='/api'
export function getToken(){return localStorage.getItem('voltix_token')}
export async function api(path,options={}){
 const headers={'Content-Type':'application/json',...(options.headers||{})}
 const token=getToken();if(token)headers.Authorization=`Bearer ${token}`
 const res=await fetch(`${API}${path}`,{...options,headers})
 const data=await res.json().catch(()=>({}))
 if(!res.ok)throw new Error(data.error||'Request failed')
 return data
}
