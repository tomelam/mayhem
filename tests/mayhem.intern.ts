import has = require('intern/dojo/has');
import intern = require('intern');

var config: intern.Config = {
	excludeInstrumentation: intern.args.fast ?
		/./ :
		/(?:^|[\/\\])(?:node_modules|tests|third-party)[\/\\]/,
	loader: {
		packages: [
			{ name: 'dgrid', location: 'third-party/dgrid' },
			{ name: 'dstore', location: 'third-party/dstore' },
			{ name: 'dojo', location: 'third-party/dojo' },
			{ name: 'dijit', location: 'third-party/dijit' },
			{ name: 'esprima', location: 'third-party/esprima', main: 'esprima' },
			{ name: 'intl', location: 'third-party/intl', main: 'Intl.complete' },
			{ name: 'intl-messageformat', location: 'third-party/intl-messageformat/dist', main: 'intl-messageformat-with-locales' },
			{ name: 'mayhem', location: 'dist' },
			{ name: 'put-selector', location: 'third-party/put-selector' },
			{ name: 'tests', location: 'tests' },
			{ name: 'xstyle', location: 'third-party/xstyle' }
		]
	},
	reporters: has('host-node') ? [ 'tests/support/reporter' ] : [ 'console', 'html' ],
	suites: [
		'tests/unit/core/all',
		'tests/unit/binding/all',
		'tests/unit/data/all',
		'tests/unit/routing/all',
		'tests/unit/templating/all',
		'tests/unit/ui/all'
	]
};

export = config;
