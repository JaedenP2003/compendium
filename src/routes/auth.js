const express = require('express');
const router = express.Router();

router.get('/login', (req, res) => {
  res.render('auth/login', { error: null, layout: false });
});

router.post('/login', (req, res) => {
  if (req.body.password === process.env.APP_PASSWORD) {
    req.session.authed = true;
    return res.redirect('/');
  }
  res.render('auth/login', { error: 'Wrong password.', layout: false });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
