require('dotenv').config();
const express=require('express'), session=require('express-session'), helmet=require('helmet');
const rateLimit=require('express-rate-limit'), bcrypt=require('bcryptjs'), Database=require('better-sqlite3');
const path=require('path'), crypto=require('crypto');
const app=express();
const PORT=Number(process.env.PORT||3000), DB_PATH=process.env.DB_PATH||'./skypay.sqlite';
if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32) {
  console.error('SESSION_SECRET must be set to a random string of at least 32 characters. See .env.example'); process.exit(1);
}
if(!process.env.ADMIN_PHONE||!process.env.ADMIN_PASSWORD) {
  console.error('Set ADMIN_PHONE and ADMIN_PASSWORD in .env before starting.'); process.exit(1);
}
const db=new Database(DB_PATH);
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 wallet_method TEXT NOT NULL, wallet_number TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger(
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 amount INTEGER NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL,
 ref_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requests(
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 type TEXT NOT NULL, amount INTEGER NOT NULL, method TEXT, wallet_number TEXT,
 reference TEXT, status TEXT NOT NULL DEFAULT 'pending',
 admin_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders(
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
 package_id INTEGER NOT NULL, package_name TEXT NOT NULL,
 price INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`);
const now=()=>new Date().toISOString(), id=()=>crypto.randomUUID();
const getUser=db.prepare('SELECT id,phone,wallet_method,wallet_number,role,created_at FROM users WHERE id=?');
const userByPhone=db.prepare('SELECT * FROM users WHERE phone=?');
const insertUser=db.prepare('INSERT INTO users(id,phone,password_hash,wallet_method,wallet_number,role,created_at) VALUES(?,?,?,?,?,?,?)');
const adminPhone=process.env.ADMIN_PHONE.trim();
if(!userByPhone.get(adminPhone)){
 const hash=bcrypt.hashSync(process.env.ADMIN_PASSWORD,12);
 insertUser.run(id(),adminPhone,hash,'bkash',adminPhone,'admin',now());
}
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["'self'","https://fonts.gstatic.com"],scriptSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:","https:"]}}}));
app.use(express.json({limit:'30kb'}));
app.use(session({name:'skypay.sid',secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:8*60*60*1000}}));
const limiter=rateLimit({windowMs:15*60*1000,limit:100,standardHeaders:true,legacyHeaders:false});
app.use('/api',limiter);
const packages=[{id:1,name:'Starter',price:400,description:'ডেমো পণ্য/সার্ভিস'},{id:2,name:'Standard',price:800,description:'ডেমো পণ্য/সার্ভিস'},{id:3,name:'Premium',price:1700,description:'ডেমো পণ্য/সার্ভিস'}];
function auth(req,res,next){if(!req.session.uid)return res.status(401).json({error:'লগইন প্রয়োজন'});req.user=getUser.get(req.session.uid);if(!req.user)return res.status(401).json({error:'সেশন অকার্যকর'});next()}
function admin(req,res,next){if(req.user.role!=='admin')return res.status(403).json({error:'অ্যাডমিন অনুমতি প্রয়োজন'});next()}
function validPhone(v){return /^01[3-9]\d{8}$/.test(String(v||''))}
function balance(uid){return db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM ledger WHERE user_id=?').get(uid).n}
function log(uid,amount,kind,note,ref=null){db.prepare('INSERT INTO ledger(id,user_id,amount,kind,note,ref_id,created_at) VALUES(?,?,?,?,?,?,?)').run(id(),uid,amount,kind,note,ref,now())}
app.get('/api/health',(req,res)=>res.json({ok:true,service:'SKYPAY API'}));
app.post('/api/register',(req,res)=>{
 const {phone,password,method,wallet}=req.body||{};
 if(!validPhone(phone)||!validPhone(wallet)||!['bkash','nagad','rocket'].includes(method)||typeof password!=='string'||password.length<8||password.length>72)
 return res.status(400).json({error:'সঠিক ফোন/ওয়ালেট নম্বর, পেমেন্ট মাধ্যম এবং কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড দিন'});
 if(userByPhone.get(phone))return res.status(409).json({error:'এই নম্বরে অ্যাকাউন্ট আছে'});
 const uid=id();insertUser.run(uid,phone,bcrypt.hashSync(password,12),method,wallet,'user',now());
 req.session.uid=uid;res.json({user:getUser.get(uid),balance:0});
});
app.post('/api/login',(req,res)=>{
 const {phone,password}=req.body||{},u=userByPhone.get(phone);
 if(!u||!bcrypt.compareSync(String(password||''),u.password_hash))return res.status(401).json({error:'মোবাইল অথবা পাসওয়ার্ড ভুল'});
 req.session.uid=u.id;res.json({user:getUser.get(u.id),balance:balance(u.id)});
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>{res.clearCookie('skypay.sid');res.json({ok:true})}));
app.get('/api/me',auth,(req,res)=>res.json({user:req.user,balance:balance(req.user.id)}));
app.get('/api/packages',(req,res)=>res.json(packages));
app.get('/api/dashboard',auth,(req,res)=>{
 const uid=req.user.id;
 res.json({user:req.user,balance:balance(uid),
 orders:db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC').all(uid),
 requests:db.prepare('SELECT id,type,amount,method,wallet_number,reference,status,admin_note,created_at FROM requests WHERE user_id=? ORDER BY created_at DESC').all(uid),
 ledger:db.prepare('SELECT amount,kind,note,created_at FROM ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(uid)});
});
app.post('/api/deposit-request',auth,(req,res)=>{
 const amount=Number(req.body?.amount),reference=String(req.body?.reference||'').trim();
 if(!Number.isSafeInteger(amount)||amount<1||amount>1000000||reference.length<4||reference.length>80)return res.status(400).json({error:'সঠিক পরিমাণ ও লেনদেন রেফারেন্স দিন'});
 const rid=id();db.prepare(`INSERT INTO requests(id,user_id,type,amount,method,wallet_number,reference,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
 .run(rid,req.user.id,'deposit',amount,req.user.wallet_method,req.user.wallet_number,reference,'pending',now(),now());
 res.json({ok:true,message:'ডিপোজিট অনুরোধ জমা হয়েছে। যাচাই না হওয়া পর্যন্ত ব্যালেন্স যোগ হবে না।'});
});
app.post('/api/withdraw-request',auth,(req,res)=>{
 const amount=Number(req.body?.amount);
 if(!Number.isSafeInteger(amount)||amount<1||amount>1000000)return res.status(400).json({error:'সঠিক পরিমাণ লিখুন'});
 const available=balance(req.user.id);
 const pending=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM requests WHERE user_id=? AND type='withdraw' AND status='pending'").get(req.user.id).n;
 if(amount>available-pending)return res.status(400).json({error:'পর্যাপ্ত অনুমোদিত ব্যালেন্স নেই'});
 const rid=id();db.prepare(`INSERT INTO requests(id,user_id,type,amount,method,wallet_number,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`)
 .run(rid,req.user.id,'withdraw',amount,req.user.wallet_method,req.user.wallet_number,'pending',now(),now());
 res.json({ok:true,message:'উত্তোলন অনুরোধ জমা হয়েছে। অ্যাডমিন যাচাই করবে।'});
});
app.post('/api/orders',auth,(req,res)=>{
 const p=packages.find(x=>x.id===Number(req.body?.packageId));if(!p)return res.status(404).json({error:'প্যাকেজ পাওয়া যায়নি'});
 const tx=db.transaction(()=>{if(balance(req.user.id)<p.price)throw new Error('পর্যাপ্ত ব্যালেন্স নেই');const oid=id();log(req.user.id,-p.price,'purchase',p.name,oid);
 db.prepare('INSERT INTO orders(id,user_id,package_id,package_name,price,status,created_at) VALUES(?,?,?,?,?,?,?)').run(oid,req.user.id,p.id,p.name,p.price,'confirmed',now());});
 try{tx();res.json({ok:true,message:'অর্ডার সম্পন্ন হয়েছে'})}catch(e){res.status(400).json({error:e.message})}
});
app.get('/api/admin/summary',auth,admin,(req,res)=>{
 const users=db.prepare('SELECT id,phone,wallet_method,wallet_number,created_at FROM users ORDER BY created_at DESC').all();
 const requests=db.prepare(`SELECT r.*,u.phone FROM requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC`).all();
 res.json({users:users.map(u=>({...u,balance:balance(u.id)})),requests});
});
app.post('/api/admin/request/:id/review',auth,admin,(req,res)=>{
 const {decision,note=''}=req.body||{};if(!['approve','reject'].includes(decision))return res.status(400).json({error:'সিদ্ধান্ত সঠিক নয়'});
 const r=db.prepare('SELECT * FROM requests WHERE id=?').get(req.params.id);if(!r)return res.status(404).json({error:'অনুরোধ পাওয়া যায়নি'});
 if(r.status!=='pending')return res.status(409).json({error:'এই অনুরোধ আগেই নিষ্পত্তি হয়েছে'});
 const tx=db.transaction(()=>{
  if(decision==='approve'&&r.type==='deposit')log(r.user_id,r.amount,'deposit','অ্যাডমিন অনুমোদিত ডিপোজিট',r.id);
  if(decision==='approve'&&r.type==='withdraw')log(r.user_id,-r.amount,'withdraw','অ্যাডমিন অনুমোদিত উত্তোলন',r.id);
  db.prepare('UPDATE requests SET status=?,admin_note=?,updated_at=? WHERE id=?').run(decision==='approve'?'approved':'rejected',String(note).slice(0,300),now(),r.id);
 });try{tx();res.json({ok:true})}catch(e){res.status(400).json({error:'অনুরোধ প্রক্রিয়া করা যায়নি'})}
});
app.get('/api/admin/settings',auth,admin,(req,res)=>res.json({notice:db.prepare("SELECT value FROM settings WHERE key='notice'").get()?.value||'স্বাগতম SKYPAY'}));
app.put('/api/admin/settings',auth,admin,(req,res)=>{const notice=String(req.body?.notice||'').slice(0,500);db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('notice',notice);res.json({ok:true})});
app.use(express.static(path.join(__dirname,'public')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`SKYPAY running on http://localhost:${PORT}`));
