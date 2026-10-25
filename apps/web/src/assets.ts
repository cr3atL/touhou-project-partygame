/** Vite injects the project Pages prefix for both JS and public assets. */
export function publicAsset(path: string, base = import.meta.env.BASE_URL): string {
  return `${base.endsWith('/') ? base : base + '/'}${path.replace(/^\/+/, '')}`;
}
