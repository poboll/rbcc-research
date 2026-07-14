export async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `请求失败 (${response.status})`);
  }
  return response;
}

export async function json(path, options) {
  return (await api(path, options)).json();
}

export function jsonOptions(method, body) {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function downloadBlob(response, fallbackName) {
  return response.blob().then(blob => {
    const disposition = response.headers.get("content-disposition") || "";
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
    const name = encoded ? decodeURIComponent(encoded) : fallbackName;
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(href);
  });
}
