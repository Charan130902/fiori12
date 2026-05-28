sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/export/Spreadsheet"
], function (Controller, JSONModel, MessageToast, MessageBox, Spreadsheet) {
    "use strict";

    // Load SheetJS (XLSX parser) dynamically from CDN
    function loadSheetJS(callback) {
        if (window.XLSX) {
            callback();
            return;
        }
        var script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        script.onload = callback;
        script.onerror = function () {
            MessageBox.error("Failed to load XLSX library. Please check your internet connection.");
        };
        document.head.appendChild(script);
    }

    return Controller.extend("com.fileupload.controller.dataView", {

        onInit: function () {
            this._oSelectedFile = null;
            this.getView().setModel(new JSONModel({
                Employees: [],
                busy: false,
                rowCount: 0
            }), "empModel");

            // Preload SheetJS
            loadSheetJS(function () {
                console.log("SheetJS loaded successfully.");
            });

            this.onFetchData();
        },

        // ─── File Selection ───────────────────────────────────────────
        onFileChange: function (oEvent) {
            var oFile = oEvent.getParameter("files")[0];
            if (!oFile) {
                this._oSelectedFile = null;
                return;
            }

            var sName = oFile.name.toLowerCase();
            var bValid = sName.endsWith(".csv") || sName.endsWith(".xlsx") || sName.endsWith(".xls");

            if (!bValid) {
                MessageBox.warning("Unsupported file type.\nPlease upload a CSV (.csv) or Excel (.xlsx / .xls) file.");
                this.byId("idFileUploader").clear();
                this._oSelectedFile = null;
                return;
            }

            this._oSelectedFile = oFile;
            MessageToast.show("File selected: " + oFile.name);
        },

        // ─── Upload Button Press ──────────────────────────────────────
        onUploadExcel: function () {
            if (!this._oSelectedFile) {
                MessageBox.warning("Please select a CSV or Excel file first.");
                return;
            }

            var sName = this._oSelectedFile.name.toLowerCase();

            if (sName.endsWith(".csv")) {
                this._readCSV(this._oSelectedFile);
            } else if (sName.endsWith(".xlsx") || sName.endsWith(".xls")) {
                this._readXLSX(this._oSelectedFile);
            }
        },

        // ─── Read CSV ─────────────────────────────────────────────────
        _readCSV: function (oFile) {
            var that = this;
            var oReader = new FileReader();

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
                MessageBox.error("Failed to read the CSV file.");
            };

            oReader.readAsText(oFile);
        },

        // ─── Read XLSX / XLS ──────────────────────────────────────────
        _readXLSX: function (oFile) {
            var that = this;

            loadSheetJS(function () {
                var oReader = new FileReader();

                oReader.onload = function (e) {
                    try {
                        var data = new Uint8Array(e.target.result);
                        var workbook = window.XLSX.read(data, { type: "array" });

                        // Read first sheet
                        var sFirstSheet = workbook.SheetNames[0];
                        var worksheet = workbook.Sheets[sFirstSheet];

                        // Convert to JSON (header row = keys)
                        var aRaw = window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                        // Normalize keys to uppercase
                        var aRows = aRaw.map(function (oRow) {
                            var oNorm = {};
                            Object.keys(oRow).forEach(function (key) {
                                oNorm[key.trim().toUpperCase()] = String(oRow[key]).trim();
                            });
                            return oNorm;
                        });

                        if (!aRows || aRows.length === 0) {
                            MessageBox.warning("Excel file is empty or has no valid data rows.");
                            return;
                        }

                        that._uploadRowsToBackend(aRows);

                    } catch (err) {
                        console.error("XLSX parse error:", err);
                        MessageBox.error("Failed to parse Excel file.\n\nDetails: " + err.message);
                    }
                };

                oReader.onerror = function () {
                    MessageBox.error("Failed to read the Excel file.");
                };

                oReader.readAsArrayBuffer(oFile);
            });
        },

        // ─── CSV to JSON ──────────────────────────────────────────────
        _csvToJson: function (sCsv) {
            var aLines = sCsv.trim().split(/\r?\n/);
            if (aLines.length < 2) return [];

            var aHeaders = aLines[0].split(",").map(function (h) {
                return h.trim().toUpperCase().replace(/['"]/g, "");
            });

            return aLines.slice(1)
                .filter(function (line) { return line.trim() !== ""; })
                .map(function (line) {
                    // Handle quoted values with commas inside
                    var aValues = [];
                    var bInQuote = false;
                    var sCurrent = "";
                    for (var i = 0; i < line.length; i++) {
                        var ch = line[i];
                        if (ch === '"') {
                            bInQuote = !bInQuote;
                        } else if (ch === "," && !bInQuote) {
                            aValues.push(sCurrent.trim());
                            sCurrent = "";
                        } else {
                            sCurrent += ch;
                        }
                    }
                    aValues.push(sCurrent.trim()); // last value

                    var oRow = {};
                    aHeaders.forEach(function (h, i) {
                        oRow[h] = aValues[i] !== undefined ? aValues[i] : "";
                    });
                    return oRow;
                });
        },

        // ─── Upload Rows to OData Backend ────────────────────────────
        _uploadRowsToBackend: function (aRows) {
            var oModel = this.getOwnerComponent().getModel();
            var that = this;
            var iSuccess = 0;
            var iFailed = 0;

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
                        console.error("Row upload failed:", oPayload, oError);
                        that._checkUploadComplete(iSuccess, iFailed, aRows.length);
                    }
                });
            });
        },

        // ─── Upload Completion Check ──────────────────────────────────
        _checkUploadComplete: function (iSuccess, iFailed, iTotal) {
            if (iSuccess + iFailed === iTotal) {
                this.getView().getModel("empModel").setProperty("/busy", false);

                MessageBox.information(
                    "Upload completed!\n\n✔ Success: " + iSuccess + "\n✘ Failed: " + iFailed,
                    { title: "Upload Summary" }
                );

                this.byId("idFileUploader").clear();
                this._oSelectedFile = null;
                this.onFetchData();
            }
        },

        // ─── Fetch All Data ───────────────────────────────────────────
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

        // ─── Download Excel ───────────────────────────────────────────
        onDownloadExcel: function () {
            var oTable = this.byId("empTable");
            var oBinding = oTable.getBinding("items");
            var aContexts = oBinding.getCurrentContexts();

            if (!aContexts || aContexts.length === 0) {
                MessageBox.warning("No data available to download.");
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

        // ─── Search / Filter ──────────────────────────────────────────
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
            this.getView().getModel("empModel").setProperty("/rowCount", oBinding.getLength());
        },

        // ─── Timestamp Helper ─────────────────────────────────────────
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