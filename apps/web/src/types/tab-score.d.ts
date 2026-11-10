declare module "@danzw/tab-score/ascii" {
  export interface AsciiSpecNote {
    string: number;
    fret: number | string;
  }
  export interface AsciiSpecHit {
    at: number;
    dur: number;
    notes: AsciiSpecNote[];
  }
  export interface AsciiSpec {
    title?: string;
    subtitle?: string;
    artist?: string;
    tempo?: number;
    timeSignature?: [number, number];
    bars: { hits: AsciiSpecHit[] }[];
  }
  export function asciiTabToSpec(text: string): AsciiSpec;
  export function asciiTabToAlphaTex(
    text: string,
    toTex: (spec: AsciiSpec) => string,
  ): string;
}

declare module "@danzw/tab-score/spec" {
  export function specToAlphaTex(spec: unknown): string;
}
