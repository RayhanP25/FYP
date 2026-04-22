declare module 'plyr' {
  class Plyr {
    constructor(targets: HTMLElement | string, options?: any);
    destroy(): void;
    static setup(targets: any, options?: any): Plyr[];
    static supported(mediaType?: string, provider?: string, playsInline?: boolean): any;
  }
  
  export default Plyr;
}
