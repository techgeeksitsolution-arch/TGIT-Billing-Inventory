(function () {
  "use strict";

  const fields = ["companyName", "gstin", "phone", "address", "udyam", "bankDetails"];

  document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("settingsForm");
    if (!form) return;
    const settings = await TGITDB.getSettings();
    fields.forEach((field) => {
      const input = document.getElementById(field);
      if (input) input.value = settings[field] || "";
    });
    setPreview("logoPreview", settings.logoDataUrl);
    setPreview("signaturePreview", settings.signatureDataUrl);

    document.getElementById("logoFile").addEventListener("change", async (event) => {
      settings.logoDataUrl = await fileToDataUrl(event.target.files[0]);
      setPreview("logoPreview", settings.logoDataUrl);
    });
    document.getElementById("signatureFile").addEventListener("change", async (event) => {
      settings.signatureDataUrl = await fileToDataUrl(event.target.files[0]);
      setPreview("signaturePreview", settings.signatureDataUrl);
    });
    document.getElementById("clearLogo").addEventListener("click", () => {
      settings.logoDataUrl = "";
      setPreview("logoPreview", "");
    });
    document.getElementById("clearSignature").addEventListener("click", () => {
      settings.signatureDataUrl = "";
      setPreview("signaturePreview", "");
    });
    document.getElementById("restoreDefaults").addEventListener("click", async () => {
      Object.assign(settings, TGITUtils.COMPANY_DEFAULTS);
      await TGITDB.saveSettings(settings);
      location.reload();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      fields.forEach((field) => settings[field] = document.getElementById(field).value);
      await TGITDB.saveSettings(settings);
      flash("Settings saved permanently.");
    });
  });

  function fileToDataUrl(file) {
    if (!file) return Promise.resolve("");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function setPreview(id, src) {
    const img = document.getElementById(id);
    if (!img) return;
    img.src = src || "";
    img.hidden = !src;
  }

  function flash(message) {
    const el = document.getElementById("settingsStatus");
    el.textContent = message;
    setTimeout(() => el.textContent = "", 3000);
  }
})();
