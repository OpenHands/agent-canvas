import type { TFunction } from "i18next";
import { I18nKey } from "#/i18n/declaration";

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB maximum file size
const MAX_TOTAL_SIZE = 3 * 1024 * 1024; // 3MB maximum total size for all files combined
const SIZE_LIMIT_MB = 3;

export interface FileValidationResult {
  isValid: boolean;
  errorMessage?: string;
  errorKey?: I18nKey;
  errorParams?: Record<string, string | number>;
  oversizedFiles?: string[];
}

/**
 * Validates individual file sizes
 */
export function validateIndividualFileSizes(
  files: File[],
): FileValidationResult {
  const oversizedFiles = files.filter((file) => file.size > MAX_FILE_SIZE);

  if (oversizedFiles.length > 0) {
    const fileNames = oversizedFiles.map((f) => f.name);
    return {
      isValid: false,
      errorKey: I18nKey.CHAT_INTERFACE$FILES_EXCEED_SIZE,
      errorParams: {
        limit: SIZE_LIMIT_MB,
        files: fileNames.join(", "),
      },
      oversizedFiles: fileNames,
    };
  }

  return { isValid: true };
}

/**
 * Validates total file size including existing files
 */
export function validateTotalFileSize(
  newFiles: File[],
  existingFiles: File[] = [],
): FileValidationResult {
  const currentTotalSize = existingFiles.reduce(
    (sum, file) => sum + file.size,
    0,
  );
  const newFilesSize = newFiles.reduce((sum, file) => sum + file.size, 0);
  const totalSize = currentTotalSize + newFilesSize;

  if (totalSize > MAX_TOTAL_SIZE) {
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      errorKey: I18nKey.CHAT_INTERFACE$TOTAL_FILE_SIZE_EXCEEDS_LIMIT,
      errorParams: {
        size: totalSizeMB,
        limit: SIZE_LIMIT_MB,
      },
    };
  }

  return { isValid: true };
}

/**
 * Validates both individual and total file sizes
 */
export function validateFiles(
  newFiles: File[],
  existingFiles: File[] = [],
): FileValidationResult {
  // First check individual file sizes
  const individualValidation = validateIndividualFileSizes(newFiles);
  if (!individualValidation.isValid) {
    return individualValidation;
  }

  // Then check total size
  return validateTotalFileSize(newFiles, existingFiles);
}

export function formatFileValidationError(
  validation: FileValidationResult,
  t: TFunction,
) {
  if (validation.errorKey) {
    return t(validation.errorKey, validation.errorParams);
  }

  return (
    validation.errorMessage ?? t(I18nKey.CHAT_INTERFACE$INVALID_ATTACHMENTS)
  );
}
