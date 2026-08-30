import { useState, useEffect } from "react";

const API = "/api/v1";

/**
 * Reads a Response safely. Never calls res.json() blindly: a crashed backend
 * (or a dev-server proxy with no upstream) returns an empty body, and
 * res.json() then throws the useless
 * "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
 * Returns { ok, status, data, errorMessage }.
 */
async function readResponse(res) {
  const text = await res.text().catch(() => "");

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (res.ok) {
    if (data === null) {
      return {
        ok: false,
        status: res.status,
        data: null,
        errorMessage: `Server returned HTTP ${res.status} with an invalid or empty body`,
      };
    }
    return { ok: true, status: res.status, data, errorMessage: null };
  }

  const errorMessage =
    data?.error?.message ||
    (text ? `HTTP ${res.status}: ${text.slice(0, 200)}` : null) ||
    (res.status >= 500
      ? `Server error (HTTP ${res.status}). The backend may be down — check it is running on port 4000.`
      : `Request failed (HTTP ${res.status} ${res.statusText || ""})`.trim());

  return { ok: false, status: res.status, data, errorMessage };
}

function toError({ status, data, errorMessage }) {
  const err = new Error(errorMessage);
  err.status = status;
  if (data?.error?.code) err.code = data.error.code;
  if (data?.error?.details) err.details = data.error.details;
  return err;
}

export function useFetch(url, options) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}${url}`, options);
      const parsed = await readResponse(res);
      if (!parsed.ok) throw toError(parsed);
      setData(parsed.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refetch();
  }, [url]);

  return { data, loading, error, refetch };
}

export async function apiGet(url) {
  const res = await fetch(`${API}${url}`);
  const parsed = await readResponse(res);
  if (!parsed.ok) throw toError(parsed);
  return parsed.data;
}

export async function apiDelete(url) {
  const res = await fetch(`${API}${url}`, { method: "DELETE" });
  const parsed = await readResponse(res);
  if (!parsed.ok) throw toError(parsed);
  return parsed.data;
}

export async function apiPost(url, body) {
  const res = await fetch(`${API}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await readResponse(res);
  if (!parsed.ok) throw toError(parsed);
  return parsed.data;
}

export async function apiPut(url, body) {
  const res = await fetch(`${API}${url}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await readResponse(res);
  if (!parsed.ok) throw toError(parsed);
  return parsed.data;
}

export async function apiUpload(url, file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);
  const xhr = new XMLHttpRequest();
  return new Promise((resolve, reject) => {
    xhr.open("POST", `${API}${url}`);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(toError({ status: xhr.status, data, errorMessage: data?.error?.message || `Upload failed (HTTP ${xhr.status})` }));
      } catch {
        reject(new Error("Invalid server response"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.send(formData);
  });
}
