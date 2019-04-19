/* eslint-env node */

const fs = require('fs');

module.exports = function (app) {
  const morgan  = require('morgan');
  app.use(morgan('dev'));

  const showdown  = require('showdown');
  const converter = new showdown.Converter();

  fs.readFile(`${__dirname}/docs/getting-started.md`, 'utf8', (err, data) => {
    if (err) throw err;
    const html = converter.makeHtml(data);
    console.log(html);
  });
};
