export function notFound(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.originalUrl}`
    }
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error(error);
  const payload = {
    error: {
      code: error.code || "INTERNAL_SERVER_ERROR",
      message: error.statusCode ? error.message : "An unexpected error occurred"
    }
  };
  if (error.details) payload.error.details = error.details;
  res.status(error.statusCode || 500).json(payload);
}
