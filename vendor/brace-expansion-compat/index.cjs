'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Legacy CommonJS is this adapter's purpose.
const modern = require('brace-expansion-modern');

module.exports = modern.expand;
module.exports.expand = modern.expand;
module.exports.EXPANSION_MAX = modern.EXPANSION_MAX;
module.exports.EXPANSION_MAX_LENGTH = modern.EXPANSION_MAX_LENGTH;
