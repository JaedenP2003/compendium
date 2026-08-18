const express = require('express');
const router = express.Router();
const categories = require('../controllers/categoriesController');

router.get('/categories/:slug', categories.show);

module.exports = router;
