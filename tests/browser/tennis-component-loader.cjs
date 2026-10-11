/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
// Test-only JSX compilation through Next's already installed SWC; no extra dependency.
module.exports = function (source) {
  const callback = this.async();
  require('next/dist/build/swc').transform(source, {
    filename: this.resourcePath,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, target: 'es2020', transform: { react: { runtime: 'automatic' } } },
    module: { type: 'es6' },
  }).then(result => callback(null, result.code), callback);
};
