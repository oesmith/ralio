# Contributing

## Setup your development environment
```
% brew install node
🍺  /usr/local/Cellar/node/0.10.10: 1169 files, 16M, built in 90 seconds

% curl https://npmjs.org/install.sh | sh
/usr/local/bin/npm -> /usr/local/lib/node_modules/npm/bin/npm-cli.js
npm@1.2.28 /usr/local/lib/node_modules/npm
It worked

% npm version
{ http_parser: '1.0',
  node: '0.10.10',
  v8: '3.14.5.9',
  ares: '1.9.0-DEV',
  uv: '0.10.10',
  zlib: '1.2.3',
  modules: '11',
  openssl: '1.0.1e',
  npm: '1.2.28' }

% brew install elinks
🍺  /usr/local/Cellar/elinks/0.11.7: 42 files, 2.7M, built in 71 seconds
```

## Get the code
1. Fork the repository in GitHub
1. Clone locally (instructions assume ~/projects/ralio)

```
% cd ~/projects/ralio
% npm install
npm http GET https://registry.npmjs.org/sinon/1.4.2
...
```

## Run the ralio tests
Run the mocha tests, ensure no failures or test environment problems
```
% cd ~/projects/ralio
% npm test
npm WARN package.json ralio@0.4.4 No repository field.

> ralio@0.4.4 test /Users/pairing/projects/ralio
> mocha


  ․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․․

  44 tests complete (79 ms)
  2 tests pending
```

## Run ralio locally from source
```
% cd ~/projects/ralio
% ./bin/ralio --help

  Usage: ralio [options] [command]
  ...

% ./bin/ralio configure
Type your Rally's username: user@domain.com
Type your Rally's password: *********
Type your Rally's project: Your-Project
Type your Rally's team: Your-Team
All set! :)

% ./bin/ralio backlog
  1 US12345 - Add contribution instructions to ralio repository
  2 ...
```

## Submitting pull requests

Contributions very welcome! Please write tests for any new features - use [mocha](http://visionmedia.github.com/mocha/) to run the test suite.
