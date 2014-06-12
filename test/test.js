'use strict';
var test = require('tape');

var fetchFamous = require('../lib').fetchFamous;
var clone = require('../lib').clone;

test('returns function', function (t) {
  t.plan(1);
  t.equal(typeof fetchFamous, 'function', 'Module returns function');
});

test('invalid semver', function (t) {
  t.plan(3);
  fetchFamous(undefined, function(err, famous) {

    t.ok(err instanceof Error, 'Error returned.');
    t.equal(err.message, 'Missing or invalid git reference', 'Correct error message for invalid semver.');
    t.equal(famous, undefined, 'return value of `famous` is undefined.');

  });
});

function makeCheckoutTest(ref) {
  return function (t) {
    var currentFamousModules = require('./famous-modules-' + ref + '.json');
    t.plan(2 + currentFamousModules.length);

    fetchFamous(ref, function(err, famous) {

      t.equal(err, undefined, 'No error returned.');
      t.equal(typeof famous, 'object', 'fetchFamous returned object');

      currentFamousModules.forEach(function(key) {
        t.equal(typeof famous[key], 'string', key + ' exists.');
      });

    });
  };
}

test('valid semver', makeCheckoutTest('0.2.1'));
test('valid sha1 hash', makeCheckoutTest('6b2ad41b3c024a298d778e6344383d846ae7fa98'));

test('clone other repo', function (t) {
  t.plan(2);
  clone({
    repo: 'git@github.com:Famous/core.git',
    ref: 'master'
  }, function(err, corePath) {
    t.equal(err, undefined, 'No error returned.');
    t.equal(typeof corePath, 'string');
  });
});
