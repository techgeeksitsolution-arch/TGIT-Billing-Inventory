(function () {
  "use strict";

  async function elementToPdf(element, fileName) {
    const { jsPDF } = window.jspdf;
    const canvas = await html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight
    });
    const pdf = new jsPDF("p", "mm", "a4", true);
    const img = canvas.toDataURL("image/png", 1.0);
    pdf.addImage(img, "PNG", 0, 0, 210, 297, undefined, "FAST");
    pdf.save(fileName);
  }

  async function downloadInvoice(invoice, settings, hiddenHost) {
    const host = hiddenHost || document.createElement("div");
    host.className = "pdf-render-host";
    host.innerHTML = TGITInvoice.renderInvoice(invoice, settings);
    if (!hiddenHost) document.body.appendChild(host);
    await waitForImages(host);
    await elementToPdf(host.querySelector(".invoice-sheet"), TGITUtils.invoiceFileName(invoice));
    if (!hiddenHost) host.remove();
  }

  async function waitForImages(root) {
    const images = Array.from(root.querySelectorAll("img"));
    await Promise.all(images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));
  }

  window.TGITPDF = {
    elementToPdf,
    downloadInvoice,
    waitForImages
  };
})();
