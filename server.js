const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Prepare DB
const DB_FILE = path.join(__dirname, 'database.sqlite');
const initSql = fs.readFileSync(path.join(__dirname, 'init-db.sql'), 'utf8');
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, '');
}
const db = new Database(DB_FILE);
// Run init SQL (idempotent)
initSql.split(/;\s*\n/).forEach(s => { if (s.trim()) db.exec(s); });

// Ensure default admin exists
const adminUser = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
(async ()=>{
  if(!adminUser){
    const hash = await bcrypt.hash('admin123', 10);
    db.prepare('INSERT INTO users(username,password,role) VALUES (?,?,?)').run('admin', hash, 'admin');
    console.log('Default admin created: username=admin password=admin123');
  }
})();

// Middlewares
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: 'verysecretkey', resave: false, saveUninitialized: true }));

// Simple auth middleware
function requireLogin(req,res,next){
  if(req.session && req.session.user) return next();
  return res.redirect('/views/login.html');
}

function requireRole(role){
  return (req,res,next)=>{
    if(req.session && req.session.user && req.session.user.role===role) return next();
    // allow admin to access kasir pages if needed
    if(req.session && req.session.user && req.session.user.role==='admin') return next();
    return res.status(403).json({error:'Forbidden'});
  }
}

// Views routes (simple static serve of /views)
app.use('/views', express.static(path.join(__dirname, 'views')));

// Auth endpoints
app.post('/api/login', async (req,res)=>{
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if(!user) return res.status(401).json({ error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password);
  if(!match) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/logout', (req,res)=>{
  req.session.destroy(()=>res.json({ok:true}));
});

// Routes mount
app.use('/api/products', require('./routes/products')(db));
app.use('/api/transactions', require('./routes/transactions')(db));
app.use('/api/reports', require('./routes/reports')(db));

// Simple info
app.get('/api/me', (req,res)=>{
  res.json({ user: req.session.user || null });
});

app.listen(PORT, ()=> console.log('Server running on http://localhost:'+PORT));
