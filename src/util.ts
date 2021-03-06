import { after as aspectAfter, before as aspectBefore } from 'dojo/aspect';
import has from './has';
import Promise from './Promise';
export { deepCopy, deepCreate } from 'dojo/request/util';

// TODO: Use node.d.ts
declare var process: any;

var hasOwnProperty = Object.prototype.hasOwnProperty;

export function addUnloadCallback(callback: () => void): IHandle {
	if (has('host-node')) {
		process.on('exit', callback);
		return createHandle(function () {
			process.removeListener('exit', callback);
		});
	}
	else if (has('host-browser')) {
		return aspectBefore(window, 'onbeforeunload', callback);
	}
	/* istanbul ignore next */
	else {
		throw new Error('Not supported on this platform');
	}
}

export function createCompositeHandle(...handles: IHandle[]): IHandle {
	return createHandle(function () {
		for (var i = 0, handle: IHandle; (handle = handles[i]); ++i) {
			handle.remove();
		}
	});
}

export function createHandle(destructor: () => void): IHandle {
	return {
		remove: function () {
			this.remove = function () {};
			destructor.call(this);
		}
	};
}

export function createTimer(callback: (...args: any[]) => void, delay: number = 0): IHandle {
	var timerId: number;
	if (has('raf') && delay === 0) {
		timerId = requestAnimationFrame(callback);
		return createHandle(function () {
			cancelAnimationFrame(timerId);
			timerId = null;
		});
	}
	else {
		timerId = setTimeout(callback, delay);
		return createHandle(function () {
			clearTimeout(timerId);
			timerId = null;
		});
	}
}

export function debounce<T extends (...args: any[]) => void>(callback: T, delay: number = 0): T {
	var timer: IHandle;

	return <T> function () {
		timer && timer.remove();

		var self = this;
		var args = arguments;

		timer = createTimer(function () {
			callback.apply(self, args);
			self = args = timer = null;
		}, delay);
	};
}

interface DeferredCall {
	original: Function;
	args: IArguments;
}

// TODO: Not sure if `instead` is a good idea; talk to Bryan
export function deferMethods(
	target: {},
	methods: string[],
	untilMethod: string,
	instead?: (method: string, args: IArguments) => any
): void {
	// Avoid TS7017 but still allow the method signature to be typed properly
	var _target: any = target;
	var waiting: HashMap<DeferredCall> = {};
	var untilHandle = aspectAfter(target, untilMethod, function () {
		untilHandle.remove();
		untilHandle = null;

		for (var method in waiting) {
			var info: DeferredCall = waiting[method];

			_target[method] = info.original;
			info.args && _target[method].apply(_target, info.args);
		}

		_target = waiting = null;
	}, true);

	methods.forEach(function (method: string) {
		var info: DeferredCall = waiting[method] = {
			original: _target[method],
			args: null
		};

		_target[method] = function () {
			info.args = instead && instead.call(target, method, arguments) || arguments;
		};
	});
}

export function deferSetters(
	target: {},
	properties: string[],
	untilMethod: string,
	instead?: (setter: string, value: any) => any
): void {
	deferMethods(
		target,
		properties.map(property => '_' + property + 'Setter'),
		untilMethod,
		instead ? function (method: string, args: IArguments) {
			return instead.call(this, method.slice(1, -6), args[0]);
		} : undefined
	);
}

/**
 * Finds the first index of `searchString` in `source`, unless `searchString` is prefixed by a backslash in the source
 * string (escaped), in which case it is considered not a match.
 *
 * @param source The string to search.
 * @param searchString The string to search for.
 * @param position The index to start the search.
 * @returns The position of the search string, or -1 if the string is not found.
 */
export function escapedIndexOf(source: string, searchString: string, position?: number): number {
	var index: number;

	if (source === '' || searchString === '' || position < 0) {
		return -1;
	}

	do {
		index = source.indexOf(searchString, position);

		if (source.charAt(index - 1) !== '\\' || source.slice(index - 2, index) === '\\\\') {
			break;
		}

		position = index + 1;
	} while (index > -1);

	return index;
}

/**
 * Splits a string `source` by a string `separator`, unless `separator` is prefixed by a backslash in the source string
 * (escaped), in which case the backslash is removed and no split occurs.
 *
 * @param source The string to split.
 * @param separator The separator to split on.
 * @returns The split string.
 */
export function escapedSplit(source: string, separator: string): string[] {
	var result: string[] = [];
	var part = '';

	if (separator === '') {
		result.push(source);
		return result;
	}

	for (var i = 0, j = source.length; i < j; ++i) {
		if (source.charAt(i) === '\\') {
			if (source.slice(i + 1, i + separator.length + 1) === separator) {
				part += separator;
				i += separator.length;
			}
			else if (source.charAt(i + 1) === '\\') {
				part += '\\';
				i += 1;
			}
			else {
				part += source.charAt(i);
			}
		}
		else if (source.slice(i, i + separator.length) === separator) {
			result.push(part);
			part = '';
			i += separator.length - 1;
		}
		else {
			part += source.charAt(i);
		}
	}

	result.push(part);

	return result;
}

/**
 * Escapes a string of text for injection into a serialization of HTML or XML.
 */
export function escapeXml(text: string, forAttribute: boolean = true): string {
	text = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');

	if (forAttribute) {
		text = text.replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	return text;
}

export function getModule<T>(moduleId: string, returnDefault: boolean = false): Promise<T> {
	return getModules([ moduleId ]).then(function (modules: T[]): T {
		var value = modules[0];
		return returnDefault && value && 'default' in value ? (<any> value).default : value;
	});
}

export interface RequireError extends Error {
	url: string;
	originalError: Error;
}

/**
 * Retrieves a property descriptor from the given object or any of its inherited prototypes.
 *
 * @param object The object on which to look for the property.
 * @param property The name of the property.
 * @returns The property descriptor.
 */
export function getPropertyDescriptor(object: Object, property: string): PropertyDescriptor {
	var descriptor: PropertyDescriptor;
	do {
		descriptor = Object.getOwnPropertyDescriptor(object, property);
	} while (!descriptor && (object = Object.getPrototypeOf(object)));

	return descriptor;
}

export function getModules<T>(moduleIds: string[]): Promise<T[]> {
	var dfd = new Promise.Deferred<T[]>();
	var handle: IHandle;

	if (require.on) {
		var moduleUrls: HashMap<string> = {};
		for (var i = 0; i < moduleIds.length; i++) {
			moduleUrls[require.toUrl(moduleIds[i])] = moduleIds[i];
		}

		handle = require.on('error', function (error: { message: string; info: any[]; }) {
			// TODO: handle plugins correctly
			if (error.message === 'scriptError') {
				var moduleUrl = error.info[0].slice(0, -3);
				if (moduleUrl in moduleUrls) {
					handle && handle.remove();
					handle = null;

					var reportedError: RequireError = <any> new Error('Couldn\'t load ' + moduleUrls[moduleUrl] + ' from ' + error.info[0]);
					reportedError.url = error.info[0];
					reportedError.originalError = error.info[1];
					dfd.reject(reportedError);

					// Dojo's require function caches module requests, even failed ones
					// This ensures subsequent attempts to load the same bad mid (e.g. 404) will continue to throw
					// (...or if the resource was temporarily unavailable, subsequent attempts might actually succeed)
					if (require.undef) {
						require.undef(moduleUrls[moduleUrl]);
					}
				}
			}
		});
	}

	require(moduleIds, function (...modules: T[]) {
		handle && handle.remove();
		handle = null;

		// require does not emit an 'error' event in some environments (IE8, Node.js), instead the module is
		// not resolved ('not-a-module'). This improves behavior in IE8, but it's still broken in Node.js.
		modules.every(function (module: T | string, index: number, modules: T[]) {
			if (<string> module === 'not-a-module') {
				var reportedError: RequireError = <any> new Error('Couldn\'t load module ' + moduleIds[index]);
				dfd.reject(reportedError);

				return false;
			}

			return true;
		});

		dfd.resolve(modules);
	});

	return dfd.promise;
}

/**
 * Retrieves all enumerable keys from an object.
 */
export var getObjectKeys = has('es5') ? Object.keys : function (object: {}): string[] {
	var keys: string[] = [];

	for (var key in object) {
		hasOwnProperty.call(object, key) && keys.push(key);
	}

	return keys;
};

/**
 * Determines whether two values are strictly equal, also treating
 * NaN as equal to NaN.
 */
export function isEqual(a: any, b: any): boolean {
	return a === b || /* both values are NaN */ (a !== a && b !== b);
}

/**
 * Determines whether or not a value is an Object, in the EcmaScript specification
 * sense of an Object.
 */
export function isObject(object: any): boolean {
	var type = typeof object;
	return object != null && (type === 'object' || type === 'function');
}

/**
 * Finds and removes `needle` from `haystack`, if it exists.
 */
export function spliceMatch<T>(haystack: T[], needle: T): boolean {
	for (var i = 0; i < haystack.length; ++i) {
		if (haystack[i] === needle) {
			haystack.splice(i, 1);
			return true;
		}
	}

	return false;
}

export function unescapeXml(text: string): string {
	var entityMap: HashMap<string> = {
		lt: '<',
		gt: '>',
		amp: '&',
		quot: '"',
		apos: '\''
	};

	return text.replace(/&([^;]+);/g, function (_: string, entity: string) {
		if (entityMap[entity]) {
			return entityMap[entity];
		}

		if (entity.charAt(0) === '#') {
			if (entity.charAt(1) === 'x') {
				return String.fromCharCode(Number('0' + entity.slice(1)));
			}

			return String.fromCharCode(Number(entity.slice(1)));
		}
		else {
			return '&' + entity + ';';
		}
	});
}
