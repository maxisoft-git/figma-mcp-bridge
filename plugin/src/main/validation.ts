import { createError, PluginErrorCode } from "./errors";

export type HandlerParams<T> = T;

export const validateRequired = (value: unknown, name: string): void => {
  if (value === undefined || value === null) {
    throw createError(PluginErrorCode.VALIDATION_ERROR, `${name} is required`);
  }
};

export const validateString = (value: unknown, name: string): string => {
  if (typeof value !== "string") {
    throw createError(PluginErrorCode.VALIDATION_ERROR, `${name} must be a string`);
  }
  return value;
};

export const validateNumber = (value: unknown, name: string): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw createError(PluginErrorCode.VALIDATION_ERROR, `${name} must be a number`);
  }
  return value;
};

export const validateBoolean = (value: unknown, name: string): boolean => {
  if (typeof value !== "boolean") {
    throw createError(PluginErrorCode.VALIDATION_ERROR, `${name} must be a boolean`);
  }
  return value;
};

export const validateArray = (value: unknown, name: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw createError(PluginErrorCode.VALIDATION_ERROR, `${name} must be an array`);
  }
  return value;
};

export const validateHexColor = (value: unknown, name: string): string => {
  const str = validateString(value, name);
  if (!/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(str)) {
    throw createError(PluginErrorCode.VALIDATION_ERROR, `${name} must be a valid hex color`);
  }
  return str;
};

export const validateRange = (
  value: number,
  name: string,
  min: number,
  max: number
): number => {
  if (value < min || value > max) {
    throw createError(
      PluginErrorCode.VALIDATION_ERROR,
      `${name} must be between ${min} and ${max}`
    );
  }
  return value;
};

export const validateEnum = <T extends string>(
  value: unknown,
  name: string,
  enumValues: readonly T[]
): T => {
  if (typeof value !== "string" || !enumValues.includes(value as T)) {
    throw createError(
      PluginErrorCode.VALIDATION_ERROR,
      `${name} must be one of: ${enumValues.join(", ")}`
    );
  }
  return value as T;
};

export const validateNodeId = (value: unknown, name: string): string => {
  const str = validateString(value, name);
  if (!/^\d+:\d+(;\d+:\d+)*$/.test(str)) {
    throw createError(
      PluginErrorCode.VALIDATION_ERROR,
      `${name} must be a valid Figma node ID`
    );
  }
  return str;
};

export const validatePositiveNumber = (value: unknown, name: string): number => {
  const num = validateNumber(value, name);
  if (num <= 0) {
    throw createError(PluginErrorCode.VALIDATION_ERROR, `${name} must be positive`);
  }
  return num;
};

export const validateObject = (value: unknown, name: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw createError(PluginErrorCode.VALIDATION_ERROR, `${name} must be an object`);
  }
  return value as Record<string, unknown>;
};