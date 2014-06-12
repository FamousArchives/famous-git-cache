'use strict';
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
var mkdirp = require('mkdirp');
var crypto = require('crypto');

// ref: http://stackoverflow.com/a/468397/461146
var sha1RE = /\b([a-f0-9]{40})\b/;

function sha256sum(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function runGitCommand(args, options, callback) {
  which('git', function(err, binPath){
    if (err) { return callback(err); }
    exec(binPath, args, options, function (err, stdout, stderr) {
      if (err) {
        err.gitargs = args;
        err.gitopts = options;
        err.stdout = stdout;
        err.stderr = stderr;
        return callback(err);
      }
      callback(err, stdout, stderr);
    });
  });
}

function updateGitMirror(gitDir, callback) {
  fs.stat(gitDir, function(err, stat) {
    if (err) { return callback(err); }
    fs.writeFileSync(path.join(os.tmpdir(), 'stat'), Date.now() - stat.mtime.getTime(), 'utf8');
    if (Date.now() - stat.mtime.getTime() > 30000) {
      fs.appendFileSync(path.join(os.tmpdir(), 'stat'), '\n updated', 'utf8');
      var args = [ 'remote', 'update' ];
      var options = { cwd: gitDir };
      runGitCommand(args, options, function(err) {
        if (err) { return callback(err); }
        callback(undefined, gitDir);
      });
    } else {
      fs.appendFileSync(path.join(os.tmpdir(), 'stat'), '\n cached', 'utf8');
      callback(undefined, gitDir);
    }
  });
}

function updateSubmodules(workTree, callback) {
  var args = [ '--work-tree', workTree, 'submodule', 'update', '--init', '--recursive' ];
  var options = {cwd: workTree};
  runGitCommand(args, options, function(err) {
    if (err) { return callback(err); }
    callback(undefined, workTree);
  });
}

function showRefs(gitDir, callback) {
  var args = [ 'show-ref' ];
  var options = {cwd: gitDir};
  runGitCommand(args, options, function(err, stdout) {
    if (err) { return callback(err); }

    var refs = stdout.split('\n').reduce(function(previousValue, currentValue) {
      var ref = currentValue.split(' ');
      if (ref.length === 2) {
        var commit = ref[0];
        var refKey = ref[1];
        previousValue[refKey] = commit;
      }
      return previousValue;
    }, {});

    callback(undefined, refs);
  });
}

function mirrorGitRemote(opts, callback) {
  var repo = opts.repo;
  var gitDir = opts.gitDir;

  fs.exists(gitDir, function(exists) {
    if (exists) {
      updateGitMirror(gitDir, callback);
    } else {
      mkdirp(gitDir, function(err) {
        if (err) { return callback(err); }
        var args = [ 'clone', '--mirror', repo, gitDir ];
        var options = {cwd: gitDir};
        runGitCommand(args, options, function(err) {
          if (err) { return callback(err); }
          callback(undefined, gitDir);
        });
      });
    }
  });
}

var mirrorQueue = async.queue(mirrorGitRemote, 1);

function cleanup (dir, callback) {
  fs.exists(dir, function(exists) {
    if (exists) {
      rimraf(dir, callback);
    } else {
      callback();
    }
  });
}

function checkoutGitRef(opts, callback) {
  var ref = opts.ref;
  var gitDir = opts.gitDir;

  var workTree = path.join(gitDir, '..', 'raw');
  cleanup(workTree, function(err) {
    if (err) { return callback(err); }
    mkdirp(workTree, function(err){
      if (err) { return callback(err); }
      var args = [ '--work-tree', workTree, 'checkout', ref, '--force' ];
      var options = {cwd: gitDir};
      runGitCommand(args, options, function(err) {
        if (err) { return callback(err); }
        callback(undefined, workTree);
      });
    });
  });
}

var checkoutQueue = async.queue(checkoutGitRef, 1);

function getArchivedMirrorPath (opts) {
  return path.join(opts.cachePath, sha256sum(opts.repo), '.git');
}

function archiveMirror (opts, callback) {
  var mirrorPath = getArchivedMirrorPath(opts);
  console.log('git-cache', 'Fetching git-repo:', opts.repo, '(large repos may take a while)');
  mirrorQueue.push({
    repo: opts.repo,
    gitDir: mirrorPath
  }, callback);
}

function getRefs(opts, callback) {
  archiveMirror(opts, function(err, mirrorPath) {
    if (err) { return callback(err); }
    showRefs(mirrorPath, callback);
  });
}

function checkout (opts, callback) {
  archiveMirror(opts, function(err, mirrorPath) {
    if (err) { return callback(err); }
    checkoutQueue.push({
      ref: opts.ref,
      gitDir: mirrorPath
    }, callback);
  });
}

// =============================================================================

function isDesiredFile (filepath) {
  return /\.js$/.test(filepath) &&
        filepath.indexOf('Gruntfile') === -1 &&
        filepath.indexOf('dist/') === -1;
}

function getFamousModulePaths (famousPath, callback) {
  var modules = [];
  var finder = findit(famousPath);
  finder.on('file', function(file) {
    if (isDesiredFile(file) ) {
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

function clone (opts, callback) {
  var err;

  opts = extend({
    cachePath: path.join(os.tmpdir(), 'git-cache'),
    ref: 'master'
  }, opts);

  if (!opts.repo || typeof opts.repo !== 'string') {
    err = new Error('Missing or invalid git repo URI');
  }

  if (!opts.ref || typeof opts.ref !== 'string') {
    err = new Error('Missing or invalid git reference');
  }

  if (err) {
    return callback(err);
  }

  checkout(opts, function(err, dir) {
    if (err) { return callback(err); }
    updateSubmodules(dir, callback);
  });
}

function fetchFamous (version, callback) {
  clone({
    repo: 'git@github.com:Famous/famous.git',
    ref: version
  }, function(err, famousPath) {
    if (err) { return callback(err); }
    getFamousModulePaths(famousPath, function(err, modulePaths) {
      if (err) { return callback(err); }
      readFamousModules(modulePaths, callback);
    });
  });
}

exports.fetchFamous = fetchFamous;
exports.clone = clone;
