function errorHandler(err, req, res, next) {
  console.error(err);

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Server error';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(e => e.message).join(', ');
  }
  if (err.code === 11000) {
    statusCode = 409;
    message = 'That name is already taken';
  }
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID';
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'File exceeds the maximum allowed size';
  }

  res.status(statusCode).json({ success: false, message });
}

module.exports = errorHandler;
