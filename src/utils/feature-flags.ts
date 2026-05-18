function loadFeatureFlag(
  flagName: string,
  defaultValue: boolean = false,
): boolean {
  try {
    const stringValue =
      localStorage.getItem(`FEATURE_${flagName}`) || defaultValue.toString();
    const value = !!JSON.parse(stringValue);
    return value;
  } catch (e) {
    return defaultValue;
  }
}

export const VSCODE_IN_NEW_TAB = () => loadFeatureFlag("VSCODE_IN_NEW_TAB");
