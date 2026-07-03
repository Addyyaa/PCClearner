/// <reference types="vite/client" />

import type { PccleanerApi } from '../../preload'

declare global {
  interface Window {
    api: PccleanerApi
  }
}
