export class EventLog {
  constructor(listEl, { maxEntries = 300 } = {}) {
    this.listEl = listEl;
    this.maxEntries = maxEntries;
    this.entries = [];
  }

  add(type, message) {
    const time = new Date();
    this.entries.push({ time, type, message });
    if (this.entries.length > this.maxEntries) this.entries.shift();

    const li = document.createElement("li");
    li.className = `log-item log-${type}`;
    const ts = time.toLocaleTimeString("ja-JP", { hour12: false });
    li.innerHTML = `<span class="log-time">${ts}</span><span class="log-msg">${message}</span>`;
    this.listEl.prepend(li);
    while (this.listEl.children.length > this.maxEntries) {
      this.listEl.removeChild(this.listEl.lastChild);
    }
  }

  clear() {
    this.entries = [];
    this.listEl.innerHTML = "";
  }

  toCSV() {
    const rows = [["timestamp", "type", "message"]];
    for (const e of this.entries) {
      rows.push([e.time.toISOString(), e.type, e.message.replace(/"/g, '""')]);
    }
    return rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  }
}

export function downloadText(filename, text, mime = "text/csv") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCanvasPNG(filename, canvas) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}
