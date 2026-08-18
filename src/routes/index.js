const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('categories/index', { categories: res.locals.sidebarCategories });
});

module.exports = router;
