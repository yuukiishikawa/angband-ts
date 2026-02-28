/**
 * @file store/index.ts
 * @brief Store layer barrel export
 *
 * Store/shop system: creation, pricing, buy/sell, stock management, home.
 */

export {
  // Enums
  StoreType,
  STORE_TYPE_MAX,

  // Constants
  DEFAULT_MAX_STOCK,
  HOME_MAX_STOCK,

  // Interfaces
  type StoreOwner,
  type Store,
  type BuyResult,
  type SellResult,

  // Functions
  createStore,
  objectBaseValue,
  storeGetPrice,
  storeCarries,
  storeBuy,
  storeSell,
  initStoreStock,
  storeMaintenance,
  homeStore,
  homeRetrieve,
} from "./store.js";
