const path = require('path');
const express = require('express');
const app = express();

// Serving Static files in public dir
app.use(express.static(path.join(__dirname, 'public')));

// Three JS - Serving Static files in build
app.use(
  '/build/',
  express.static(path.join(__dirname, 'node_modules/three/build'))
);

// Three JS - Serving Static files in jsm
app.use(
  '/jsm/',
  express.static(path.join(__dirname, 'node_modules/three/examples/jsm'))
);

// View engine
app.set('view engine', 'ejs');

// Routes
const main = require('./routes/main');
const index = require('./routes/index');
const _404 = require('./routes/_404');

app.use('/pushwagner_soft_city', main);
app.use(index);
app.use(_404);

// Listening
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on port... ${PORT}`);
});
