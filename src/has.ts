import has = require('dojo/has');

has.add('debug', true);

// TODO: Remove all non-es5 code branches
has.add('es5', true);
has.add('es6-weak-map', typeof WeakMap !== 'undefined');
has.add('es7-object-observe', 'observe' in Object);
has.add('set-immediate', typeof setImmediate !== 'undefined');

has.add('raf', typeof requestAnimationFrame === 'function');
has.add('intl', typeof Intl !== 'undefined');

if (typeof window !== 'undefined') {
	var minimumWindowDimension = Math.min(window.innerWidth, window.innerHeight);

	has.add('phone', has('touch') && minimumWindowDimension <= 640);
	has.add('tablet', has('touch') && !has('phone'));
}

if (has('dom')) {
	has.add('dom-tree-walker', typeof document.createTreeWalker !== 'undefined');
	has.add('dom-mspointerevents', 'MsPointerEvent' in window);
	has.add('dom-pointerevents', 'PointerEvent' in window);
	has.add('dom-touch', 'ontouchstart' in document);
	has.add('dom-mouse', 'onmousedown' in document);
	if (has('dom-addeventlistener')) {
		// https://code.google.com/p/chromium/issues/detail?id=276941
		has.add('dom-mouse-buttons', 'buttons' in document.createEvent('MouseEvent'));
		has.add('dom-keyboard-key', 'key' in document.createEvent('KeyboardEvent'));
		has.add('dom-keyboard-keyIdentifier', 'keyIdentifier' in document.createEvent('KeyboardEvent'));
		has.add('dom-keyboard-isComposing', 'isComposing' in document.createEvent('KeyboardEvent'));
		has.add('dom-keyboard-code', 'code' in document.createEvent('KeyboardEvent'));
	}
	else {
		// TODO: Not sure how to test this
		// IE8 will not fire mousedown/mouseup/click if the user is double-clicking
		has.add('dom-dblclick-bug', true);
	}

	// IE8: incomplete DOM implementation
	has.add('dom-node-interface', typeof Node !== 'undefined');
	has.add('dom-bad-expandos', function () {
		try {
			return ((<any> document.createTextNode('')).foo = true) !== true;
		}
		catch (error) {
			return true;
		}
	});

	// IE8: https://social.msdn.microsoft.com/Forums/ie/en-US/33fd33f7-e857-4f6f-978e-fd486eba7174/how-to-inject-style-into-a-page
	has.add('dom-firstchild-empty-bug', function () {
		var element: HTMLElement = arguments[2];
		element.innerHTML = '<!--foo-->';
		return element.childNodes.length === 0;
	});

	// Chrome: https://code.google.com/p/chromium/issues/detail?id=43394
	has.add('webidl-bad-descriptors', function () {
		var element: HTMLDivElement = arguments[2];
		return Boolean(element && Object.getOwnPropertyDescriptor(element, 'nodeValue') != null);
	});
}

export default has;
