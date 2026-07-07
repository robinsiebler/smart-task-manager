const express = require('express');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

app.use(express.json());

// routes mount here, e.g.:
// app.use('/api/auth', require('./routes/auth.routes'));

app.use(errorMiddleware); // must be registered last

module.exports = app;
