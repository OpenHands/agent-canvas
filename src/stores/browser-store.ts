import { create, createStore, type StateCreator, type StoreApi } from "zustand";

export interface BrowserState {
  url: string;
  screenshotSrc: string;
}

export interface BrowserStore extends BrowserState {
  setUrl: (url: string) => void;
  setScreenshotSrc: (screenshotSrc: string) => void;
  reset: () => void;
}

export type BrowserStoreApi = StoreApi<BrowserStore>;

const initialState: BrowserState = {
  url: "https://github.com/OpenHands/OpenHands",
  screenshotSrc: "",
};

const createBrowserState: StateCreator<BrowserStore> = (set) => ({
  ...initialState,
  setUrl: (url: string) => set({ url }),
  setScreenshotSrc: (screenshotSrc: string) => set({ screenshotSrc }),
  reset: () => set(initialState),
});

export const createBrowserStore = (): BrowserStoreApi =>
  createStore<BrowserStore>()(createBrowserState);

export const useBrowserStore = create<BrowserStore>()(createBrowserState);
