const { logger } = require("../utils/logger");
const { sanitizeForLog } = require("../utils/sanitize");

/**
 * Get client IP address
 */
const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.ip
  );
};

/**
 * Audit logging middleware
 * Logs webhook requests to structured logger for real-time monitoring.
 * Persisted webhook events are handled by trustless_work_webhook_events.
 */
const auditLog = async (req, res, next) => {
  const startTime = Date.now();
  const requestId =
    req.headers["x-request-id"] ||
    `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Attach request ID to request object
  req.requestId = requestId;

  // Capture request details
  const auditData = {
    request_id: requestId,
    endpoint: req.path,
    method: req.method,
    ip_address: getClientIp(req),
    user_id:
      req.user?.userId ||
      req.body?.session_variables?.["x-hasura-user-id"] ||
      null,
    user_role:
      req.user?.role ||
      req.body?.session_variables?.["x-hasura-role"] ||
      "anonymous",
    request_body: sanitizeForLog(req.body),
    headers: sanitizeForLog({
      "user-agent": req.headers["user-agent"],
      "content-type": req.headers["content-type"],
      "x-hasura-role": req.headers["x-hasura-role"],
    }),
  };

  // Capture response
  const originalJson = res.json.bind(res);
  let responseBody = null;
  let statusCode = null;

  res.json = function (data) {
    responseBody = data;
    statusCode = res.statusCode;

    const duration = Date.now() - startTime;
    logAudit(auditData, statusCode, responseBody, duration);

    return originalJson(data);
  };

  next();
};

/**
 * Log webhook request to structured logger (no DB write; trustless_work_webhook_events handles persisted events).
 */
function logAudit(auditData, statusCode, responseBody, duration) {
  logger.info("Webhook request audited", {
    requestId: auditData.request_id,
    endpoint: auditData.endpoint,
    method: auditData.method,
    status: statusCode,
    duration: `${duration}ms`,
    userId: auditData.user_id,
    ip: auditData.ip_address,
  });
}

module.exports = auditLog;
