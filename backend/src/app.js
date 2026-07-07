const express = require('express');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

app.use(express.json());

app.use('/api/users', require('./routes/user.routes'));

app.use(errorMiddleware); // must be registered last

module.exports = app;
