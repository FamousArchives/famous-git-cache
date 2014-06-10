'use strict';
var semver = require('semver');
var async = require('async');
var exec = require('child_process').execFile;
var which = require('which');
var findit = require('findit');
var path = require('path');
var fs = require('fs');
var os = require('os');
var commondir = require('commondir');
var extend = require('xtend');
var rimraf = require('rimraf');

function runGitCommand (args, options, callback) {
  which('git', function(err, binPath){
    if (err) { return callback(err); }
    exec(binPath, args, options, callback);
  });
}

function cloneRepoAndCheckoutBranch (repo, branch, callback) {
  var out = path.join(os.tmpdir(), branch);
  var cloneArgs = [ 'clone', repo, '--branch', branch, '--recursive', branch];
  var cloneOptions = { cwd: os.tmpdir() };

  function clone () {
    runGitCommand(cloneArgs, cloneOptions, function(err, stdout, stderr) {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return callback(err);
      }
      callback(undefined, out);
    });
  }

  fs.exists(out, function(exists) {
    if (exists) {
      rimraf(out, function (err) {
        if (err) { return callback(err); }
        clone();
      });
    } else {
      clone();
    }
  });
}

function isJavaScriptFile (filepath) {
  return /\.js$/.test(filepath);
}

function getFamousModulePaths (famousPath, callback) {
  var modules = [];
  var finder = findit(famousPath);
  finder.on('file', function(file) {
    if (isJavaScriptFile(file) &&
        file.indexOf('Gruntfile') === -1 &&
        file.indexOf('dist/') === -1) {
      modules.push(file);
    }
  });
  finder.on('error', callback);
  finder.on('end', function() {
    callback(undefined, modules);
  });
}

function readFamousModules (modulePaths, callback) {
  var famousDir = commondir(modulePaths);
  async.map(modulePaths, function(filepath, done) {
    fs.readFile(filepath, 'utf8', function(err, data) {
      if (err) { return done(err); }
      var hash = {};
      var key = path.relative(famousDir, filepath);
      key = key.slice(0, key.length - path.extname(key).length);
      hash[key] = data;
      done(undefined, hash);
    });
  }, function(err, hashes) {
    if (err) { return callback(err); }
    var finalHash = extend.apply({}, hashes);
    callback(undefined, finalHash);
  });
}

function fetchFamous (version, callback) {
  var err;
  if (!semver.valid(version)) {
    err = new Error('Invalid semver');
    return callback(err);
  }

  var repo = 'git@github.com:Famous/famous.git';

  cloneRepoAndCheckoutBranch(repo, version, function(err, outPath) {
    if (err) { return callback(err); }
    getFamousModulePaths(outPath, function(err, modulePaths) {
      if (err) { return callback(err); }
      readFamousModules(modulePaths, callback);
    });
  });
}

module.exports = fetchFamous;
