/* eslint-env node */

// Uncomment this for json-server support
// const jsonServer = require('json-server');
// const jsonRouter = jsonServer.router('db.json');
// const middlewares = jsonServer.defaults();

module.exports = function (app) {
  // Log proxy requests
  const morgan  = require('morgan');
  app.use(morgan('dev'));

  // Uncomment this for json-server support
  // app.use(middlewares);
  // app.use((req, res, next) => {
  //   if (req.accepts('json') && !req.accepts('html')) {
  //     jsonRouter(req, res, next);
  //   } else {
  //     next();
  //   }
  // });

  // Uncomment this for client-side routing
  // app.use((req, res, next) => {
  //   if (req.accepts('html')) {
  //     req.serveUrl = '/index.html';
  //   }
  //
  //   next();
  // });
};
