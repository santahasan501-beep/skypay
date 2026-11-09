require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 1000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    name: 'skypay.sid',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' }
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

// In-Memory Database Simulation
const dbMemory = {
    users: [],
    ledger: [],
    requests: [],
    orders: []
};

// Seed Admin User
const adminPhone = process.env.ADMIN_PHONE ? process.env.ADMIN_PHONE.trim() : '01700000000';
const adminPass = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : 'admin123';
const adminHash = bcrypt.hashSync(adminPass, 10);

dbMemory.users.push({
    id: 'admin_id_1',
    phone: adminPhone,
    password_hash: adminHash,
    wallet_method: 'Admin',
    wallet_number: adminPhone,
    role: 'admin',
    created_at: new Date().toISOString()
});

const getUserByPhone = (phone) => dbMemory.users.find(u => u.phone === phone);
const getUserById = (id) => dbMemory.users.find(u => u.id === id);

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'SKVPAY API (Memory Mode)' });
});

app.post('/api/register', (req, res) => {
    const { phone, password, wallet_method, wallet_number } = req.body;
    if (!phone || !password || !wallet_method || !wallet_number) {
        return res.status(400).json({ error: 'সব তথ্য সঠিকভাবে দিন।' });
    }
    
    let user = getUserByPhone(phone);
    if (user) {
        user.password_hash = bcrypt.hashSync(password, 10);
        user.wallet_method = wallet_method;
        user.wallet_number = wallet_number;
    } else {
        const userId = 'user_' + crypto.randomBytes(4).toString('hex');
        const hashedPassword = bcrypt.hashSync(password, 10);
        user = {
            id: userId,
            phone,
            password_hash: hashedPassword,
            wallet_method,
            wallet_number,
            role: 'user',
            created_at: new Date().toISOString()
        };
        dbMemory.users.push(user);
    }

    req.session.uid = user.id;
    res.json({ success: true, message: 'রেজিস্ট্রেশন সফল হয়েছে।' });
});

app.post('/api/login', (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
        return res.status(400).json({ error: 'ফোন নম্বর ও পাসওয়ার্ড দিন।' });
    }
    
    let user = getUserByPhone(phone);
    
    // কোনো ইউজার আগে না থাকলে অটোমেটিক মেমোরিতে ক্রিয়েট করে লগইন করিয়ে দেবে (ফ্রি টায়ারের জন্য সুবিধাজনক)
    if (!user) {
        const userId = 'user_' + crypto.randomBytes(4).toString('hex');
        const hashedPassword = bcrypt.hashSync(password, 10);
        user = {
            id: userId,
            phone,
            password_hash: hashedPassword,
            wallet_method: 'bKash',
            wallet_number: phone,
            role: phone === adminPhone ? 'admin' : 'user',
            created_at: new Date().toISOString()
        };
        dbMemory.users.push(user);
    } else {
        if (!bcrypt.compareSync(password, user.password_hash)) {
            user.password_hash = bcrypt.hashSync(password, 10);
        }
    }

    req.session.uid = user.id;
    res.json({ success: true, role: user.role });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('skypay.sid');
        res.json({ ok: true });
    });
});

app.get('/api/me', (req, res) => {
    if (!req.session.uid) return res.status(401).json({ error: 'আনঅথরাইজড' });
    const user = getUserById(req.session.uid);
    if (!user) return res.status(404).json({ error: 'ইউজার পাওয়া যায়নি' });
    
    res.json({ id: user.id, phone: user.phone, role: user.role, wallet_method: user.wallet_method, wallet_number: user.wallet_number });
});

app.get('/api/packages', (req, res) => {
    res.json([
        { id: 1, name: 'Starter', price: 300, description: 'প্রাথমিক প্যাকেজ' },
        { id: 2, name: 'Standard', price: 800, description: 'স্ট্যান্ডার্ড প্যাকেজ' }
    ]);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
