const express = require('express');
const router = express.Router();
const entries = require('../controllers/entriesController');

router.get('/entries/new', entries.newForm);
router.post('/entries', entries.create);
router.get('/entries/:slug', entries.show);
router.get('/entries/:slug/edit', entries.editForm);
router.put('/entries/:slug', entries.update);
router.delete('/entries/:slug', entries.destroy);

module.exports = router;
