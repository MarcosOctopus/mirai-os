// Tipos do conversor de fonte (o pacote não traz `.d.ts` próprio).
// `wawoff2` = conversor oficial do Google (woff2) compilado para WebAssembly.
declare module "wawoff2" {
  const woff2: {
    /** TTF/OTF → WOFF2 */
    compress(input: Uint8Array): Promise<Uint8Array>;
    /** WOFF2 → TTF */
    decompress(input: Uint8Array): Promise<Uint8Array>;
  };
  export default woff2;
}
