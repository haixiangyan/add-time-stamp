declare module 'piexifjs' {
  interface Piexif {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    load(data: string): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dump(exif: any): string;
    insert(exif: string, data: string): string;
    remove(data: string): string;
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
    InteropIFD: Record<string, number>;
  }
  const piexif: Piexif;
  export default piexif;
}
