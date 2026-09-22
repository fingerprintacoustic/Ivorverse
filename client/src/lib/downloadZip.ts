import { strToU8, zipSync } from "fflate";

/** Zip a generated project's files in the browser and download it. */
export function downloadZip(files: Array<{ path: string; content: string }>, name: string) {
  const zipped = zipSync(Object.fromEntries(files.map((f) => [f.path.replace(/^\/+/, ""), strToU8(f.content)])));
  const url = URL.createObjectURL(new Blob([zipped], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, "-") || "app"}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
