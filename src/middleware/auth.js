function requireAuth(req, res, next) {
  if (req.session.authed) return next();
  return res.redirect('/login');
}

module.exports = requireAuth;
