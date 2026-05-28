sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/export/Spreadsheet"
], function (Controller, JSONModel, MessageToast, MessageBox, Spreadsheet) {
    "use strict";

    return Controller.extend("com.fileupload.controller.dataView", {

        onInit: function () {
            this._oSelectedFile = null;
            this.getView().setModel(new JSONModel({
                Employees: [],
                busy: false,
                rowCount: 0
            }), "empModel");
            this.onFetchData();
        },

        onFileChange: function (oEvent) {
            var oFile = oEvent.getParameter("files")[0];
            if (!oFile) return;

            var sName = oFile.name.toLowerCase();
            if (!sName.endsWith(".csv")) {
                MessageBox.warning("Only CSV files are supported for upload.");
                this.byId("idFileUploader").clear();
                this._oSelectedFile = null;
                return;
            }

            this._oSelectedFile = oFile;
            MessageToast.show("File selected: " + oFile.name);
        },

        onUploadExcel: function () {
            if (!this._oSelectedFile) {
                MessageBox.warning("Please select a CSV file first.");
                return;
            }

            var oReader = new FileReader();
            var that = this;

            oReader.onload = function (e) {
                var sText = e.target.result;
                var aRows = that._csvToJson(sText);

                if (!aRows || aRows.length === 0) {
                    MessageBox.warning("CSV file is empty or has no valid data rows.");
                    return;
                }

                that._uploadRowsToBackend(aRows);
            };

            oReader.onerror = function () {
                MessageBox.error("Failed to read the selected file.");
            };

            oReader.readAsText(this._oSelectedFile);
        },

        _csvToJson: function (sCsv) {
            var aLines = sCsv.trim().split(/\r?\n/);
            if (aLines.length < 2) return [];

            var aHeaders = aLines[0].split(",").map(function (h) {
                return h.trim().toUpperCase().replace(/['"]/g, "");
            });

            return aLines.slice(1)
                .filter(function (line) { return line.trim() !== ""; })
                .map(function (line) {
                    var aValues = line.split(",");
                    var oRow = {};
                    aHeaders.forEach(function (h, i) {
                        oRow[h] = aValues[i] ? aValues[i].trim().replace(/['"]/g, "") : "";
                    });
                    return oRow;
                });
        },

        _uploadRowsToBackend: function (aRows) {
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            var iSuccess = 0;
            var iFailed = 0;

            // Set busy state
            this.getView().getModel("empModel").setProperty("/busy", true);

            aRows.forEach(function (oRow) {
                var oPayload = {
                    EMPID:       oRow["EMPID"]       || "",
                    NAME:        oRow["NAME"]        || "",
                    LOCATION:    oRow["LOCATION"]    || "",
                    DESIGNATION: oRow["DESIGNATION"] || ""
                };

                oModel.create("/EmployeeDataSet", oPayload, {
                    success: function () {
                        iSuccess++;
                        that._checkUploadComplete(iSuccess, iFailed, aRows.length);
                    },
                    error: function (oError) {
                        iFailed++;
                        console.error("Upload error for row:", oPayload, oError);
                        that._checkUploadComplete(iSuccess, iFailed, aRows.length);
                    }
                });
            });
        },

        _checkUploadComplete: function (iSuccess, iFailed, iTotal) {
            if (iSuccess + iFailed === iTotal) {
                this.getView().getModel("empModel").setProperty("/busy", false);

                MessageBox.information(
                    "Upload completed!\n\n✔ Success: " + iSuccess + "\n✘ Failed: " + iFailed,
                    { title: "Upload Summary" }
                );

                // Clear file uploader
                this.byId("idFileUploader").clear();
                this._oSelectedFile = null;

                // Refresh table
                this.onFetchData();
            }
        },

        onFetchData: function () {
            var oModel = this.getOwnerComponent().getModel();
            var that = this;

            this.getView().getModel("empModel").setProperty("/busy", true);

            oModel.read("/EmployeeDataSet", {
                success: function (oData) {
                    var aResults = oData.results || [];
                    that.getView().getModel("empModel").setData({
                        Employees: aResults,
                        busy: false,
                        rowCount: aResults.length
                    });
                    MessageToast.show(aResults.length + " record(s) loaded.");
                },
                error: function (oError) {
                    console.error("Fetch error:", oError);
                    that.getView().getModel("empModel").setProperty("/busy", false);
                    MessageBox.error("Failed to fetch data from backend.");
                }
            });
        },

        onDownloadExcel: function () {
            // Get only visible/filtered rows from table binding
            var oTable = this.byId("empTable");
            var oBinding = oTable.getBinding("items");
            var aContexts = oBinding.getCurrentContexts();

            if (!aContexts || aContexts.length === 0) {
                MessageBox.warning("No data available to download. Please fetch data first.");
                return;
            }

            var aEmployees = aContexts.map(function (oCtx) {
                return oCtx.getObject();
            });

            var aCols = [
                { label: "Employee ID",  property: "EMPID",       type: "string" },
                { label: "Name",         property: "NAME",        type: "string" },
                { label: "Location",     property: "LOCATION",    type: "string" },
                { label: "Designation",  property: "DESIGNATION", type: "string" }
            ];

            var oSettings = {
                workbook: {
                    columns: aCols,
                    context: { sheetName: "Employee Data" }
                },
                dataSource: aEmployees,
                fileName: "EmployeeData_" + this._getTimestamp() + ".xlsx",
                worker: false
            };

            var oSheet = new Spreadsheet(oSettings);
            oSheet.build()
                .then(function () {
                    MessageToast.show("Excel downloaded successfully!");
                })
                .catch(function (oError) {
                    MessageBox.error("Export failed.\n\nDetails: " + oError.message);
                })
                .finally(function () {
                    oSheet.destroy();
                });
        },

        onSearchEmployee: function (oEvent) {
            var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            var oTable = this.byId("empTable");
            var oBinding = oTable.getBinding("items");

            var aFilters = [];
            if (sQuery.trim()) {
                var Filter = sap.ui.model.Filter;
                var FilterOperator = sap.ui.model.FilterOperator;
                aFilters = [
                    new Filter({
                        filters: [
                            new Filter("EMPID",       FilterOperator.Contains, sQuery),
                            new Filter("NAME",        FilterOperator.Contains, sQuery),
                            new Filter("LOCATION",    FilterOperator.Contains, sQuery),
                            new Filter("DESIGNATION", FilterOperator.Contains, sQuery)
                        ],
                        and: false
                    })
                ];
            }

            oBinding.filter(aFilters);

            // Update row count display
            var iVisible = oBinding.getLength();
            this.getView().getModel("empModel").setProperty("/rowCount", iVisible);
        },

        _getTimestamp: function () {
            var oNow = new Date();
            return oNow.getFullYear()
                + String(oNow.getMonth() + 1).padStart(2, "0")
                + String(oNow.getDate()).padStart(2, "0")
                + "_"
                + String(oNow.getHours()).padStart(2, "0")
                + String(oNow.getMinutes()).padStart(2, "0")
                + String(oNow.getSeconds()).padStart(2, "0");
        }

    });
});