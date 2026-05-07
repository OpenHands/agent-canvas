import { describe, it, expect, beforeEach } from "vitest";
import {
  LOCAL_STORAGE_KEYS,
  LoginMethod,
  setLoginMethod,
  getLoginMethod,
  clearLoginData,
} from "#/utils/local-storage";

describe("local-storage utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Login method utilities", () => {
    describe("setLoginMethod", () => {
      it("stores the login method in local storage", () => {
        setLoginMethod(LoginMethod.GITHUB);
        expect(localStorage.getItem(LOCAL_STORAGE_KEYS.LOGIN_METHOD)).toBe(
          "github",
        );
      });

      it("stores different login methods correctly", () => {
        setLoginMethod(LoginMethod.GITLAB);
        expect(localStorage.getItem(LOCAL_STORAGE_KEYS.LOGIN_METHOD)).toBe(
          "gitlab",
        );

        setLoginMethod(LoginMethod.BITBUCKET);
        expect(localStorage.getItem(LOCAL_STORAGE_KEYS.LOGIN_METHOD)).toBe(
          "bitbucket",
        );

        setLoginMethod(LoginMethod.AZURE_DEVOPS);
        expect(localStorage.getItem(LOCAL_STORAGE_KEYS.LOGIN_METHOD)).toBe(
          "azure_devops",
        );

        setLoginMethod(LoginMethod.BITBUCKET_DATA_CENTER);
        expect(localStorage.getItem(LOCAL_STORAGE_KEYS.LOGIN_METHOD)).toBe(
          "bitbucket_data_center",
        );
      });

      it("overwrites previous login method", () => {
        setLoginMethod(LoginMethod.GITHUB);
        setLoginMethod(LoginMethod.GITLAB);
        expect(localStorage.getItem(LOCAL_STORAGE_KEYS.LOGIN_METHOD)).toBe(
          "gitlab",
        );
      });
    });

    describe("getLoginMethod", () => {
      it("returns null when no login method is set", () => {
        expect(getLoginMethod()).toBeNull();
      });

      it("returns the stored login method", () => {
        localStorage.setItem(LOCAL_STORAGE_KEYS.LOGIN_METHOD, "github");
        expect(getLoginMethod()).toBe(LoginMethod.GITHUB);
      });

      it("returns correct login method for all types", () => {
        localStorage.setItem(LOCAL_STORAGE_KEYS.LOGIN_METHOD, "gitlab");
        expect(getLoginMethod()).toBe(LoginMethod.GITLAB);

        localStorage.setItem(LOCAL_STORAGE_KEYS.LOGIN_METHOD, "bitbucket");
        expect(getLoginMethod()).toBe(LoginMethod.BITBUCKET);

        localStorage.setItem(LOCAL_STORAGE_KEYS.LOGIN_METHOD, "azure_devops");
        expect(getLoginMethod()).toBe(LoginMethod.AZURE_DEVOPS);
      });
    });

    describe("clearLoginData", () => {
      it("removes the login method from local storage", () => {
        setLoginMethod(LoginMethod.GITHUB);
        expect(getLoginMethod()).toBe(LoginMethod.GITHUB);

        clearLoginData();
        expect(getLoginMethod()).toBeNull();
      });

      it("does not throw when no login method is set", () => {
        expect(() => clearLoginData()).not.toThrow();
      });
    });
  });
});
