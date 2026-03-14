// Custom error classes.
// WHY not just throw new Error("something")?
// Because when you catch an error later, you need to know:
//   - What HTTP status code to send (404? 400? 500?)
//   - Whether it's the user's fault (bad input) or the server's fault (bug)
//
// By creating custom error classes, your error handler middleware can check
// `if (err instanceof AppError)` and respond appropriately.
//
// This is the "domain error" pattern from functional programming --
// errors are DATA, not just strings.

export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // expected error (bad input, not found, etc.)
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}
