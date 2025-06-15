const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  let error = {
    statusCode: err.statusCode || err.status || 500,
    message: err.message || "Internal Server Error",
  };

  if (err.name === "SequelizeValidationError") {
    const messages = err.errors.map((e) => e.message);
    error = {
      statusCode: 400,
      message: "Validation Error",
      errors: messages,
    };
  }

  if (err.name === "SequelizeUniqueConstraintError") {
    const field = err.errors[0].path;
    error = {
      statusCode: 400,
      message: `${field} already exists`,
    };
  }

  if (err.name === "JsonWebTokenError") {
    error = {
      statusCode: 401,
      message: "Invalid token",
    };
  }

  if (err.name === "TokenExpiredError") {
    error = {
      statusCode: 401,
      message: "Token expired",
    };
  }

  if (err.name === "SequelizeConnectionError") {
    error = {
      statusCode: 500,
      message: "Database connection error",
    };
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors }),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
