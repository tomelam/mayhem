/// <reference path="../dstore" />

import array = require('dojo/_base/array');
import core = require('../interfaces');
import data = require('./interfaces');
import has = require('../has');
import Observable = require('../Observable');
import Promise = require('../Promise');
import util = require('../util');
import ValidationError = require('../validation/ValidationError');
import Validator = require('../validation/Validator');

class Model extends Observable implements data.IModel {
	/**
	 * @protected
	 */
	static _app:any;

	// Because `app` can be something other than an actual Application object, it is set on the constructor and then
	// resolved at construction time
	static setDefaultApp(app:any):void {
		this._app = app;
	}

	/**
	 * @protected
	 */
	_app:core.IApplication;

	/**
	 * @protected
	 */
	_errors:HashMap<ValidationError[]>;

	/**
	 * @protected
	 */
	_isExtensible:boolean;

	/**
	 * @protected
	 */
	_scenario:string;

	private _currentScenarioKeys:HashMap<boolean>;
	private _dirtyProperties:HashMap<boolean>;
	private _validatorInProgress:IPromise<boolean>;

	get:Model.Getters;
	set:Model.Setters;

	constructor(kwArgs?:HashMap<any>) {
		// TODO: This happens somewhere else too I think
		// `app` needs to be set early since it is used when constructing the Property objects inside the model
		if (kwArgs && kwArgs['app'] !== undefined) {
			this._app = kwArgs['app'];
		}
		else {
			var app:any = (<typeof Model> this.constructor)._app;
			var type:string = typeof app;
			if (type === 'object') {
				this._app = app;
			}
			else if (type === 'string') {
				this._app = <any> require(app);
			}
			else if (type === 'function') {
				this._app = app(this);
			}
		}

		super(kwArgs);

		// Mass-assigned properties from the constructor are initial state and should not cause the model to become
		// dirty
		this.commit();
	}

	_initialize():void {
		super._initialize();
		this._dirtyProperties = {};
		this._errors = {};
	}

	addError(key:string, error:ValidationError):void {
		var wasValid:boolean = this.get('isValid');

		var errors:ValidationError[] = this._errors[key] || (this._errors[key] = []);
		errors.push(error);

		this._notify('isValid', false, wasValid);
	}

	clearErrors(key?:string):void {
		var wasValid:boolean = this.get('isValid');

		if (key) {
			this._errors[key] && this._errors[key].splice(0, Infinity);
		}
		else {
			var errors:HashMap<ValidationError[]> = this._errors;
			for (key in errors) {
				errors[key].splice(0, Infinity);
			}
		}

		this._notify('isValid', this.get('isValid'), wasValid);
	}

	commit():void {
		var wasDirty:boolean = this.get('isDirty');
		this._dirtyProperties = {};
		wasDirty && this._notify('isDirty', false, wasDirty);
	}

	destroy():void {
		this._validatorInProgress && this._validatorInProgress.cancel(new Error('Model is being destroyed'));
		this._errors = this._dirtyProperties = this._validatorInProgress = null;
		super.destroy();
	}

	_isDirtyGetter():boolean {
		var properties = this._dirtyProperties;
		/* tslint:disable:no-unused-variable */
		for (var key in properties) {
			/* tslint:enable:no-unused-variable */
			return true;
		}

		return false;
	}

	_isValidGetter():boolean {
		// TODO: Make this configurable
		if (this._validatorInProgress) {
			return false;
		}

		var errors = this._errors;
		for (var key in errors) {
			if (errors[key] && errors[key].length) {
				return false;
			}
		}

		return true;
	}

	// TODO: dstore interface?
	_restore(Ctor:new (...args:any[]) => Model):Model {
		return new Ctor(this);
	}

	revert():void {
		var wasDirty = this.get('isDirty');
		var properties = this._dirtyProperties;
		for (var key in properties) {
			this.set(key, this._dirtyProperties[key]);
		}
		this._dirtyProperties = {};
		this._notify('isDirty', false, wasDirty);
	}

	_scenarioSetter(value:string):void {
		var scenarios:HashMap<string[]> = this.get('scenarios');
		if (scenarios && !scenarios[value]) {
			throw new Error('Invalid scenario "' + value + '"');
		}

		this._scenario = value;

		// Users may choose not to define scenarios explicitly, in which case any scenario name is allowed
		// and all keys are allowed
		if (scenarios) {
			var scenario = scenarios[value];
			var keys = this._currentScenarioKeys = {};
			for (var i = 0, j = scenario.length; i < j; ++i) {
				keys[scenario[i]] = true;
			}
		}
		else {
			this._currentScenarioKeys = null;
		}
	}

	validate(keysToValidate?:string[]):IPromise<boolean> {
		if (this._validatorInProgress) {
			this._validatorInProgress.cancel(new Error('Validation restarted'));
		}

		this.clearErrors();

		var self = this;
		var promise:Promise<boolean> = this._validatorInProgress = new Promise<boolean>(function (
			resolve:Promise.IResolver<boolean>,
			reject:Promise.IRejecter,
			progress:Promise.IProgress,
			setCanceler:(canceler:Promise.ICanceler) => void
		):void {
			var validators:HashMap<Validator[]> = self.get('validators');
			var propertiesKeys = util.getObjectKeys(validators);
			var i = 0;
			var currentValidator:Promise<void>;

			setCanceler(function (reason:Error):void {
				currentValidator && currentValidator.cancel(reason);
				i = Infinity;
				throw reason;
			});

			(function validateNextField():void {
				var key = propertiesKeys[i++];

				if (!key) {
					// all fields have been validated
					self._validatorInProgress = currentValidator = null;
					resolve(self.get('isValid'));
				}
				else if (keysToValidate && array.indexOf(keysToValidate, key) === -1) {
					validateNextField();
				}
				else {
					var j = 0;
					var fieldValidators:Validator[] = validators[key];
					(function runNextValidator():void {
						var validator:Validator = fieldValidators[j++];
						if (validator) {
							currentValidator = Promise.resolve(validator.validate(self, key, self.get(key)))
								.then(runNextValidator, reject);
						}
						else {
							validateNextField();
						}
					})();
				}
			})();
		});

		return promise;
	}
}

Model.prototype.set = function (key:any, value?:any):void {
	if (util.isObject(key)) {
		Observable.prototype.set.apply(this, arguments);
		return;
	}

	if (this._currentScenarioKeys && !this._currentScenarioKeys[key] && !this._isExtensible) {
		// TODO: use the logger service, not console
		has('debug') && console.warn('Not setting key "' + key + '" because it is not defined in the current scenario and the model is not extensible');
		return;
	}

	var oldValue = this.get(key);
	Observable.prototype.set.call(this, key, value);
	var newValue = this.get(key);

	// TODO: Can we chain this conditionally onto a notification being sent from Observable, so if old/new values
	// end up being the same, no notification occurs and we are not checking values twice?
	if (!util.isEqual(oldValue, newValue)) {
		var wasDirty = this.get('isDirty');
		this._dirtyProperties[key] = oldValue;
		wasDirty || this._notify('isDirty', true, wasDirty);
	}
};

module Model {
	// TODO: Cannot extend Observable.Getters too; TypeScript 1.1 bug?
	export interface Getters extends data.IModel.Getters {}
	export interface Setters extends data.IModel.Setters {}
}

// `app` must always be assignable directly to the model since it is used internally and is a reserved name
Model.prototype._app = null;
Model.prototype._isExtensible = false;
Model.prototype._scenario = 'default';

export = Model;