'use strict';
var test = require('tape');

var fetchFamous = require('../lib');

test('returns function', function (t) {
  t.plan(1);
  t.equal(typeof fetchFamous, 'function', 'Module returns function');
});

test('invalid semver', function (t) {
  t.plan(3);
  fetchFamous(undefined, function(err, famous) {

    t.ok(err instanceof Error, 'Error returned.');
    t.equal(err.message, 'Invalid semver', 'Correct error message for invalid semver.');
    t.equal(famous, undefined, 'return value of `famous` is undefined.');

  });
});

test('valid semver', function (t) {
  var currentFamousModules = require('./famous-modules.json');
  t.plan(2 + currentFamousModules.length);

  fetchFamous('0.2.1', function(err, famous) {

    t.equal(err, undefined, 'No error returned.');
    t.equal(typeof famous, 'object', 'fetchFamous returned object');

    currentFamousModules.forEach(function(key) {
      t.equal(typeof famous[key], 'string', key + ' exists.');
    });

  });
});
