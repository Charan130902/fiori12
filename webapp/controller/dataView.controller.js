sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("com.fileupload.controller.dataView", {

        onInit: function () {

            // Model to store uploaded file in frontend
            this.getView().setModel(new JSONModel({
                uploadedFile: null
            }), "empModel");

        },

        // 📥 FILE UPLOAD (PDF ONLY)
        onFileChange: function (oEvent) {
            var oFile = oEvent.getParameter("files")[0];

            if (!oFile) {
                return;
            }

            // Validate PDF
            if (oFile.type !== "application/pdf") {
                MessageBox.warning("Only PDF files are allowed.");
                this.byId("idFileUploader").clear();
                return;
            }

            var that = this;
            var reader = new FileReader();

            reader.onload = function (e) {

                var oFileData = {
                    name: oFile.name,
                    type: oFile.type,
                    size: oFile.size,
                    data: e.target.result   // base64 PDF
                };

                that.getView().getModel("empModel")
                    .setProperty("/uploadedFile", oFileData);

                MessageToast.show("PDF uploaded successfully");
            };

            reader.onerror = function () {
                MessageBox.error("Failed to read PDF file");
            };

            reader.readAsDataURL(oFile); // important for preview
        },

        // 👁️ PREVIEW PDF
        onPreviewPDF: function () {

            var oFile = this.getView()
                .getModel("empModel")
                .getProperty("/uploadedFile");

            if (!oFile) {
                MessageBox.warning("No PDF uploaded yet.");
                return;
            }

            var win = window.open();
            win.document.write(
                "<iframe width='100%' height='100%' src='" +
                oFile.data +
                "'></iframe>"
            );
        },

        // ⬇️ DOWNLOAD PDF
        onDownloadPDF: function () {

            var oFile = this.getView()
                .getModel("empModel")
                .getProperty("/uploadedFile");

            if (!oFile) {
                MessageBox.warning("No PDF available to download.");
                return;
            }

            var link = document.createElement("a");
            link.href = oFile.data;
            link.download = oFile.name || "file.pdf";
            link.click();

        }

    });

});