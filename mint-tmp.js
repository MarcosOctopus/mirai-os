const fs=require('fs'),crypto=require('crypto');
const env={};for(const f of ['.env.local','.env']){try{for(const l of fs.readFileSync(f,'utf8').split('\n')){const m=l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);if(m&&!env[m[1]])env[m[1]]=m[2].replace(/^["']|["']$/g,'');}}catch{}}
const DB=require('better-sqlite3')('data/auth.db',{readonly:true});
const u=DB.prepare('select id,email from users order by id asc limit 1').get();
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const h=b64({alg:'HS256',typ:'JWT'});
const p=b64({userId:u.id,email:u.email,exp:Math.floor(Date.now()/1000)+7200});
const s=crypto.createHmac('sha256',env.JWT_SECRET).update(h+'.'+p).digest('base64url');
fs.writeFileSync('/opt/data/cache/scratch/dono.cookie',h+'.'+p+'.'+s);
console.log('uid',u.id,'ok',!!env.JWT_SECRET);
