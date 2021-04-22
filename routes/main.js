const express = require('express');
const router = express.Router();

router.get('/', (req, res, next) => {
  res.render('main', { title: 'Welcome', buttonText: 'Hide/Show Object' });
});

module.exports = router;
