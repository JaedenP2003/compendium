require('dotenv').config();
const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./db/pool');
const requireAuth = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const indexRoutes = require('./routes/index');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');
app.use(expressLayouts);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    store: new pgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
  })
);

app.use(authRoutes);
app.use(requireAuth);
app.use(indexRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Compendium listening on :${port}`));
