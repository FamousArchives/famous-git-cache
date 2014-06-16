'use strict';
var test = require('tape');

var lib = require('../lib');
var fetchFamous = lib.fetchFamous;
var clone = lib.clone;
var cleanMirror = lib.cleanMirror;
var getRefs = lib.getRefs;
var getTags = lib.getTags;
var getBranches = lib.getBranches;
var getPullRequests = lib.getPullRequests;

test('invalid ref', function (t) {
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

      t.error(err, 'No error returned.');
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


test('perf: clone same repo twice, same branch', function(t) {
  var ref = '0.2.1';
  t.plan(6);

  var opts = {
    repo: 'git@github.com:Famous/famous.git',
    ref: ref
  };

  cleanMirror(opts, function(err) {
    t.error(err, 'No error returned.');

    var startOne = Date.now();
    clone(opts, function(err, famousPath) {
      var endOne = Date.now();

      t.error(err, 'No error returned.');
      t.equal(typeof famousPath, 'string', 'clone returned string');

      var startTwo = Date.now();
      clone(opts, function(err, famousPath) {
        var endTwo = Date.now();

        t.error(err, 'No error returned.');
        t.equal(typeof famousPath, 'string', 'clone returned string');

        var firstClone = endOne - startOne;
        var secondClone = endTwo - startTwo;
        // t.equal(typeof (firstClone), 'number');
        // t.equal(typeof (secondClone), 'number');
        t.ok(firstClone > (secondClone * 10), 'The second clone was at least 10x faster than the first');
        // console.log('== 1 ==========', firstClone);
        // console.log('== 2 ==========', secondClone);
      });
    });
  });
});

// test('perf: clone same repo twice, different branch', function(t) {
//   t.plan(1);
//   t.ok(true);
// });

function makeRefGetterTester (getterFn, fixtureType) {
  return function(t) {
    var fixture = require('./famous-famous-' + fixtureType + '.json');
    t.plan(2 + Object.keys(fixture).length);
    getterFn({
      repo: 'git@github.com:Famous/famous.git'
    }, function(err, refs) {
      t.error(err, 'No error returned.');
      t.equal(typeof refs, 'object', 'refs is object');
      Object.keys(fixture).forEach(function(key) {
        t.equal(refs[key], fixture[key], ['Hash for', fixtureType, key, 'matches.'].join(' '));
      });
    });
  };
}

test('getRefs', makeRefGetterTester(getRefs, 'refs'));
test('getTags', makeRefGetterTester(getTags, 'tags'));
test('getBranches', makeRefGetterTester(getBranches, 'branches'));
test('getPullRequests', makeRefGetterTester(getPullRequests, 'pull-requests'));
