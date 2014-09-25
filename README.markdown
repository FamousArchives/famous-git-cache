famous-git-cache
============

[![Build Status](https://travis-ci.org/Famous/famous-git-cache.svg?branch=master)](https://travis-ci.org/Famous/famous-git-cache) [![Dependency Status](https://david-dm.org/Famous/famous-git-cache.svg)](https://david-dm.org/Famous/famous-git-cache) [![devDependency Status](https://david-dm.org/Famous/famous-git-cache/dev-status.svg)](https://david-dm.org/Famous/famous-git-cache#info=devDependencies)

This module is used to fetch the a git repo, checkout a specific version
and then return a plain old JavaScript key-value object hash where the key is 
the relative path (e.g. `core/Engine`) and the value is the raw content 
of the that module as a string.

Usage
-----

```
var fetchFamous = require('famous-git-cache').fetchFamous;

fetchFamous('0.2.1', function(err, famous) {
  if (err) { return console.log(err); }
  /* do something with famous */
});
```

```
var clone = require('famous-git-cache').clone;
clone({
  repo: 'git@github.com:Famous/core.git',
  ref: 'master'
}, function(err, corePath) {
  if (err) { return console.log(err); }
  /* do something with corePath */
});
```

## License 
---

This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at http://mozilla.org/MPL/2.0/.