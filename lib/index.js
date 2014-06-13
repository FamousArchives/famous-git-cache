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

function getArchivedMirrorPath (opts) {
  return path.join(opts.cachePath, sha256sum(opts.repo), '.git');
}

function getReferencePath (opts) {
  return path.join(opts.cachePath, sha256sum(opts.repo), 'raw');
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

function setDefaultOpts(opts) {
  opts = extend({
    cachePath: path.join(os.tmpdir(), 'git-cache'),
    ref: 'master'
  }, opts);
  opts.gitPath = getArchivedMirrorPath(opts);
  opts.refPath = getReferencePath(opts);
  opts.mainPath = path.dirname(opts.gitPath);
  return opts;
}

function cleanMirror (opts, callback) {
  opts = setDefaultOpts(opts);
  rimraf(opts.gitPath, callback);
}

function cleanReference (opts, callback) {
  opts = setDefaultOpts(opts);
  rimraf(opts.refPath, callback);
}

function cleanRepo (opts, callback) {
  opts = setDefaultOpts(opts);
  rimraf(opts.mainPath, callback);
}

function updateGitMirror(gitPath, callback) {
  fs.stat(gitPath, function(err, stat) {
    if (err) { return callback(err); }
    fs.writeFileSync(path.join(os.tmpdir(), 'stat'), Date.now() - stat.mtime.getTime(), 'utf8');
    if (Date.now() - stat.mtime.getTime() > 30000) {
      fs.appendFileSync(path.join(os.tmpdir(), 'stat'), '\n updated', 'utf8');
      var args = [ 'remote', 'update' ];
      var options = { cwd: gitPath };
      runGitCommand(args, options, function(err) {
        if (err) { return callback(err); }
        callback(undefined, gitPath);
      });
    } else {
      fs.appendFileSync(path.join(os.tmpdir(), 'stat'), '\n cached', 'utf8');
      callback(undefined, gitPath);
    }
  });
}

function updateSubmodules(workTree, callback) {
  var args = [ '--work-tree', workTree, 'submodule', 'update', '--init', '--recursive' ];
  var options = { cwd: workTree };

  runGitCommand(args, options, function(err) {
    if (err) { return callback(err); }
    callback(undefined, workTree);
  });
}

function showRefs(gitPath, callback) {
  var args = [ 'show-ref' ];
  var options = { cwd: gitPath };

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
  var gitPath = opts.gitPath;

  fs.exists(gitPath, function(exists) {
    if (exists) {
      updateGitMirror(gitPath, callback);
    } else {
      mkdirp(gitPath, function(err) {
        if (err) { return callback(err); }
        var args = [ 'clone', '--mirror', repo, gitPath ];
        var options = {cwd: gitPath};
        runGitCommand(args, options, function(err) {
          if (err) { return callback(err); }
          callback(undefined, gitPath);
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
  var gitPath = opts.gitPath;
  var workTree = opts.refPath;

  cleanup(workTree, function(err) {
    if (err) { return callback(err); }
    mkdirp(workTree, function(err){
      if (err) { return callback(err); }
      var args = [ '--work-tree', workTree, 'checkout', ref, '--force' ];
      var options = {cwd: gitPath};
      runGitCommand(args, options, function(err) {
        if (err) { return callback(err); }
        callback(undefined, workTree);
      });
    });
  });
}

var checkoutQueue = async.queue(checkoutGitRef, 1);

function getRefs(opts, callback) {
  opts = setDefaultOpts(opts);
  mirrorQueue.push(opts, function(err, mirrorPath) {
    if (err) { return callback(err); }
    showRefs(mirrorPath, callback);
  });
}

function makeRefTypeGetter (type) {
  var prefix = 'refs/' + type + '/';
  return function (opts, callback) {
    getRefs(opts, function(err, refs) {
      if (err) { return callback(err); }
      var desiredRefs = Object.keys(refs).reduce(function(memo, key) {
        if (key.indexOf(prefix) === 0) {
          var newKey = key.split('/').slice(2).join('/');
          memo[newKey] = refs[key];
        }
        return memo;
      }, {});
      callback(undefined, desiredRefs);
    });
  };
}

var getTags = makeRefTypeGetter('tags');
var getBranches = makeRefTypeGetter('heads');
var getPullRequests = makeRefTypeGetter('pull');

function checkout (opts, callback) {
  mirrorQueue.push(opts, function(err) {
    if (err) { return callback(err); }
    checkoutQueue.push(opts, callback);
  });
}

function clone (opts, callback) {
  var err;

  opts = setDefaultOpts(opts);

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

exports.cleanMirror = cleanMirror;
exports.cleanReference = cleanReference;
exports.cleanRepo = cleanRepo;

exports.getRefs = getRefs;
exports.getBranches = getBranches;
exports.getTags = getTags;
exports.getPullRequests = getPullRequests;

exports.fetchFamous = fetchFamous;
exports.clone = clone;
