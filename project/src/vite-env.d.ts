/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL: string
  readonly DATABASE_NAME: string
  readonly DATABASE_USERNAME: string
  readonly DATABASE_PASSWORD: string
  readonly DATABASE_TENANT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}