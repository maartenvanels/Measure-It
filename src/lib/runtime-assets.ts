const urls = new Set<string>();
export function createAssetUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  urls.add(url);
  return url;
}
export function releaseUnusedAssetUrls(retained: Set<string>): void {
  for (const url of urls) {
    if (!retained.has(url)) { URL.revokeObjectURL(url); urls.delete(url); }
  }
}
