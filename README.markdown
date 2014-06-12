fetch-famous
============

This module is used to fetch the famo.us framework, checkout a specific version
and then return a plain old JavaScript key-value object hash where the key is 
the relative path (e.g. `core/Engine`) and the value is the raw content 
of the that module as a string.

Usage
-----

```
var fetchFamous = require('fetch-famous').fetchFamous;

fetchFamous('0.2.1', function(err, famous) {
  if (err) { return console.log(err); }
  /* do something with famous */
});
```

```
var clone = require('fetch-famous').clone;
clone({
  repo: 'git@github.com:Famous/core.git',
  ref: 'master'
}, function(err, corePath) {
  if (err) { return console.log(err); }
  /* do something with corePath */
});
```
