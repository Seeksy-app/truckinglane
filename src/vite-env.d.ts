/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRUCKINGLANE_EXTENSION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
