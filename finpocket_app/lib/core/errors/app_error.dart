/// Structured application errors avoiding raw stack traces or credential leaks
abstract class AppError implements Exception {
  final String message;
  final String? code;
  final dynamic details;

  AppError(this.message, {this.code, this.details});

  @override
  String toString() => message;
}

class AuthenticationError extends AppError {
  AuthenticationError(super.message, {super.code, super.details});
}

class NetworkError extends AppError {
  NetworkError(super.message, {super.code, super.details});
}

class ValidationError extends AppError {
  final List<String> fieldErrors;
  ValidationError(super.message, {this.fieldErrors = const [], super.code, super.details});
}

class AuthorizationError extends AppError {
  AuthorizationError(super.message, {super.code, super.details});
}

class StaleDataError extends AppError {
  final DateTime? lastSyncedAt;
  StaleDataError(super.message, {this.lastSyncedAt, super.code, super.details});
}

class SyncError extends AppError {
  SyncError(super.message, {super.code, super.details});
}

class ServerError extends AppError {
  final int? statusCode;
  ServerError(super.message, {this.statusCode, super.code, super.details});
}

class GoogleAuthError extends AppError {
  final bool isCancelled;
  GoogleAuthError(super.message, {this.isCancelled = false, super.code, super.details});
}

class SessionExpiredError extends AppError {
  SessionExpiredError([super.message = 'Your session has expired. Please log in again.'])
      : super(code: 'SESSION_EXPIRED');
}

class AccountExistsUnlinkedError extends AppError {
  final String email;
  AccountExistsUnlinkedError({
    required this.email,
    String message = 'An account with this email already exists. Please log in with password to link Google.',
  }) : super(message, code: 'ACCOUNT_EXISTS_UNLINKED');
}
