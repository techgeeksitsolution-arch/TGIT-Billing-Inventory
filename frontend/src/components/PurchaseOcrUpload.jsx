import { useState, useRef, useCallback } from "react";
import { apiUpload } from "../api";
import PurchaseOcrReview from "./PurchaseOcrReview.jsx";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf";
const MAX_SIZE_MB = 15;

export default function PurchaseOcrUpload({ onSaved, onCancel }) {
  const [step, setStep] = useState("upload");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [ocrData, setOcrData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`);
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setError("File type not allowed. Use PNG, JPG, WebP, GIF, or PDF.");
      return;
    }

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    setUploading(true);
    setProgress(0);
    try {
      const data = await apiUpload("/purchases/upload-ocr", file, setProgress);
      setOcrData(data);
      setStep("review");
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  if (step === "review" && ocrData) {
    return (
      <PurchaseOcrReview
        ocrData={ocrData}
        previewUrl={previewUrl}
        onSaved={onSaved}
        onCancel={onCancel}
        onBack={() => { setStep("upload"); setOcrData(null); setPreviewUrl(null); }}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Upload Purchase Invoice for OCR</h1>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>

      {error && <div className="error-msg" onClick={() => setError(null)}>{error}</div>}

      <div
        className={`ocr-dropzone ${dragOver ? "drag-over" : ""}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {uploading ? (
          <div className="ocr-upload-progress">
            <div className="spinner" />
            <p>Processing invoice... {progress > 0 ? `${progress}%` : ""}</p>
            {progress > 0 && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        ) : (
          <div className="ocr-dropzone-content">
            <div className="ocr-dropzone-icon">📄</div>
            <p className="ocr-dropzone-title">Drop purchase invoice here or click to browse</p>
            <p className="ocr-dropzone-subtitle">
              Supports PNG, JPG, WebP, GIF, PDF — max {MAX_SIZE_MB}MB
            </p>
          </div>
        )}
      </div>

      <div className="form-card" style={{ marginTop: 16 }}>
        <h3>How it works</h3>
        <ol style={{ color: "#486581", fontSize: "0.88rem", lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Upload a purchase invoice image or PDF</li>
          <li>OCR extracts supplier details, items, and amounts (if configured)</li>
          <li>Review and edit all extracted data before saving</li>
          <li>Match existing suppliers and products, or create new ones</li>
          <li>Save as a draft purchase invoice with correct stock tracking</li>
        </ol>
        <p style={{ color: "#718096", fontSize: "0.82rem", marginTop: 8 }}>
          OCR is not trusted data — you must review and confirm everything before saving.
        </p>
      </div>
    </div>
  );
}
