/**
 * Comprehensive error handling and logging system for IvorVerse AI
 */

export type ErrorLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  timestamp: string;
  level: ErrorLevel;
  component: string;
  message: string;
  error?: Error;
  context?: Record<string, unknown>;
  userId?: number;
  requestId?: string;
}

class ErrorLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  /**
   * Log an error or message
   */
  log(
    level: ErrorLevel,
    component: string,
    message: string,
    options?: {
      error?: Error;
      context?: Record<string, unknown>;
      userId?: number;
      requestId?: string;
    }
  ) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      error: options?.error,
      context: options?.context,
      userId: options?.userId,
      requestId: options?.requestId,
    };

    this.logs.push(entry);

    // Keep logs manageable
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output for development
    const logFn = ((console as unknown) as Record<string, Function>)[level] || console.log;
    (logFn as Function)(`[${component}] ${message}`, {
      ...options?.context,
      error: options?.error?.message,
    });
  }

  debug(component: string, message: string, options?: Parameters<typeof this.log>[3]) {
    this.log("debug", component, message, options);
  }

  info(component: string, message: string, options?: Parameters<typeof this.log>[3]) {
    this.log("info", component, message, options);
  }

  warn(component: string, message: string, options?: Parameters<typeof this.log>[3]) {
    this.log("warn", component, message, options);
  }

  error(component: string, message: string, options?: Parameters<typeof this.log>[3]) {
    this.log("error", component, message, options);
  }

  fatal(component: string, message: string, options?: Parameters<typeof this.log>[3]) {
    this.log("fatal", component, message, options);
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: ErrorLevel): LogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Get logs by component
   */
  getLogsByComponent(component: string): LogEntry[] {
    return this.logs.filter((log) => log.component === component);
  }

  /**
   * Clear all logs
   */
  clearLogs() {
    this.logs = [];
  }
}

export const errorLogger = new ErrorLogger();

/**
 * User-friendly error messages
 */
export const userFriendlyErrors: Record<string, string> = {
  // Chat errors
  "chat.message_failed": "Failed to send message. Please try again.",
  "chat.invalid_project": "Invalid chat project. Please select a valid chat.",
  "chat.message_too_long": "Message is too long. Please shorten it.",
  "chat.rate_limited": "You're sending messages too quickly. Please wait a moment.",

  // Image errors
  "image.generation_failed": "Failed to generate image. Please try again.",
  "image.invalid_prompt": "Invalid image prompt. Please provide a valid description.",
  "image.download_failed": "Failed to download image. Please try again.",
  "image.storage_failed": "Failed to save image. Please try again.",

  // Research errors
  "research.search_failed": "Failed to search. Please try again.",
  "research.report_generation_failed": "Failed to generate report. Please try again.",

  // Music errors
  "music.generation_failed": "Failed to generate music. Please try again.",
  "music.invalid_input": "Invalid music input. Please provide valid parameters.",

  // Voice errors
  "voice.transcription_failed": "Failed to transcribe audio. Please try again.",
  "voice.generation_failed": "Failed to generate speech. Please try again.",
  "voice.invalid_audio": "Invalid audio file. Please upload a valid audio file.",

  // Video errors
  "video.generation_failed": "Failed to generate video. Please try again.",
  "video.processing_failed": "Video processing failed. Please try again.",

  // Character errors
  "character.creation_failed": "Failed to create character. Please try again.",
  "character.update_failed": "Failed to update character. Please try again.",
  "character.deletion_failed": "Failed to delete character. Please try again.",

  // Auth errors
  "auth.invalid_credentials": "Invalid credentials. Please check your email and password.",
  "auth.user_not_found": "User not found. Please sign up first.",
  "auth.session_expired": "Your session has expired. Please sign in again.",
  "auth.unauthorized": "You don't have permission to access this resource.",

  // Database errors
  "db.connection_failed": "Database connection failed. Please try again later.",
  "db.query_failed": "Database query failed. Please try again.",
  "db.transaction_failed": "Transaction failed. Please try again.",

  // API errors
  "api.not_found": "Resource not found. Please check the URL.",
  "api.invalid_request": "Invalid request. Please check your input.",
  "api.server_error": "Server error. Please try again later.",
  "api.rate_limited": "Too many requests. Please wait a moment.",
  "api.timeout": "Request timed out. Please try again.",

  // Generic errors
  "unknown_error": "An unexpected error occurred. Please try again.",
  "network_error": "Network error. Please check your connection.",
  "validation_error": "Invalid input. Please check your data.",
};

/**
 * Get user-friendly error message
 */
export function getUserFriendlyError(errorCode: string, defaultMessage = "An error occurred"): string {
  return userFriendlyErrors[errorCode] || defaultMessage;
}

/**
 * Log API request
 */
export function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: number
) {
  const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
  errorLogger.log(level, "API", `${method} ${path} - ${statusCode} (${duration}ms)`, {
    context: { method, path, statusCode, duration },
    userId,
  });
}

/**
 * Log API error
 */
export function logApiError(
  method: string,
  path: string,
  error: Error,
  userId?: number,
  context?: Record<string, unknown>
) {
  errorLogger.error("API", `${method} ${path} failed`, {
    error,
    context: { method, path, ...context },
    userId,
  });
}

/**
 * Log user activity
 */
export function logUserActivity(
  userId: number,
  action: string,
  details?: Record<string, unknown>
) {
  errorLogger.info("USER_ACTIVITY", `User ${userId}: ${action}`, {
    context: { userId, action, ...details },
    userId,
  });
}

/**
 * Log feature usage
 */
export function logFeatureUsage(
  userId: number,
  feature: string,
  action: string,
  details?: Record<string, unknown>
) {
  errorLogger.info("FEATURE_USAGE", `User ${userId} used ${feature}: ${action}`, {
    context: { userId, feature, action, ...details },
    userId,
  });
}

/**
 * Log database operation
 */
export function logDatabaseOperation(
  operation: string,
  table: string,
  duration: number,
  success: boolean,
  error?: Error
) {
  const level = success ? "debug" : "error";
  errorLogger.log(level, "DATABASE", `${operation} on ${table} (${duration}ms)`, {
    error,
    context: { operation, table, duration, success },
  });
}

/**
 * Log LLM call
 */
export function logLLMCall(
  userId: number,
  model: string,
  tokensUsed: number,
  duration: number,
  success: boolean,
  error?: Error
) {
  const level = success ? "info" : "error";
  errorLogger.log(level, "LLM", `${model} call (${tokensUsed} tokens, ${duration}ms)`, {
    error,
    context: { userId, model, tokensUsed, duration, success },
    userId,
  });
}

/**
 * Log storage operation
 */
export function logStorageOperation(
  operation: string,
  fileSize: number,
  duration: number,
  success: boolean,
  error?: Error
) {
  const level = success ? "debug" : "error";
  errorLogger.log(level, "STORAGE", `${operation} (${fileSize} bytes, ${duration}ms)`, {
    error,
    context: { operation, fileSize, duration, success },
  });
}
