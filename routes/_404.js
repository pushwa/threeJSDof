const express = require('express');
const router = express.Router();

router.use((req, res, next) => {
  res.status(404).render('_404', { title: 'Page Not Found' });
});

module.exports = router;
