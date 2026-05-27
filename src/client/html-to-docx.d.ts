/**
 * Ambient module declaration for `html-to-docx` (npm: html-to-docx@1.x).
 * The library ships without TypeScript types. Used by the SOW Word export
 * (see ScopeOfWorkDocument.tsx) — narrow types to just what we call so
 * future upgrades surface drift at the use site.
 */
declare module "html-to-docx" {
  type HtmlToDocxOptions = {
    orientation?: "portrait" | "landscape";
    pageNumber?: boolean;
    margins?: { top?: number; right?: number; bottom?: number; left?: number };
    title?: string;
    subject?: string;
    creator?: string;
    keywords?: string[];
    description?: string;
    lastModifiedBy?: string;
    revision?: number;
    font?: string;
    fontSize?: number;
  };

  /** Resolves to a Blob in the browser; a Buffer in Node. We only call it in
   *  the browser path so the Blob form is the relevant return type. */
  function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString?: string,
    documentOptions?: HtmlToDocxOptions,
    footerHTMLString?: string,
  ): Promise<Blob>;

  export default HTMLtoDOCX;
}
