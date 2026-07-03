declare module 'libheif-js/wasm-bundle' {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(
      imageData: ImageData | { data: Uint8ClampedArray; width: number; height: number },
      cb: (data: ImageData | null) => void,
    ): void;
  }
  interface HeifDecoderCtor {
    new (): { decode(buffer: Uint8Array | ArrayBuffer): HeifImage[] };
  }
  const libheif: { HeifDecoder: HeifDecoderCtor };
  export default libheif;
}
