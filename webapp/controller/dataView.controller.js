sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("com.fileupload.controller.dataView", {

        onInit: function () {

            this.getView().setModel(new JSONModel({
                uploadedFile: null
            }), "empModel");

        },

        // 📥 Upload PDF
        onFileChange: function (oEvent) {

            var oFile = oEvent.getParameter("files")[0];

            if (!oFile) {
                return;
            }

            if (oFile.type !== "application/pdf") {
                MessageBox.warning("Only PDF files are allowed.");
                this.byId("idFileUploader").clear();
                return;
            }

            var that = this;
            var reader = new FileReader();

            reader.onload = function (e) {

                var fileData = {
                    name: oFile.name,
                    data: e.target.result // base64
                };

                that.getView()
                    .getModel("empModel")
                    .setProperty("/uploadedFile", fileData);

                MessageToast.show("PDF uploaded successfully");
            };

            reader.readAsDataURL(oFile);
        },

        // 👁️ Preview PDF (INLINE)
        onPreviewPDF: function () {

            var oFile = this.getView()
                .getModel("empModel")
                .getProperty("/uploadedFile");

            if (!oFile) {
                MessageBox.warning("No PDF uploaded yet.");
                return;
            }

            this.byId("noPdfText").setVisible(false);

            var sHtml =
                "<iframe width='100%' height='650px' style='border:none;' src='" +
                oFile.data +
                "'></iframe>";

            this.byId("pdfFrame").setContent(sHtml);

            MessageToast.show("PDF loaded in preview area");
        },

        // ⬇️ Download PDF
        onDownloadPDF: function () {

            var oFile = this.getView()
                .getModel("empModel")
                .getProperty("/uploadedFile");

            if (!oFile) {
                MessageBox.warning("No PDF available.");
                return;
            }

            var link = document.createElement("a");
            link.href = oFile.data;
            link.download = oFile.name || "file.pdf";
            link.click();
        }

    });

});