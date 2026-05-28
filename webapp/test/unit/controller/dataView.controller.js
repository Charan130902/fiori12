/*global QUnit*/

sap.ui.define([
	"com/fileupload/controller/dataView.controller"
], function (Controller) {
	"use strict";

	QUnit.module("dataView Controller");

	QUnit.test("I should test the dataView controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
