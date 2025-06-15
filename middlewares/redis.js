const { redisClient } = require("../config/database");

const redisRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    keyGenerator = (req) => req.ip,
    message = "Too many requests from this IP, please try again later.",
  } = options;

  return async (req, res, next) => {
    try {
      const key = `ratelimit:${keyGenerator(req)}`;
      const current = await redisClient.incr(key);

      if (current === 1) {
        await redisClient.expire(key, Math.ceil(windowMs / 1000));
      }

      if (current > max) {
        return res.status(429).json({
          error: message,
          retryAfter: Math.ceil(windowMs / 1000),
        });
      }

      res.set({
        "X-RateLimit-Limit": max,
        "X-RateLimit-Remaining": Math.max(0, max - current),
        "X-RateLimit-Reset": new Date(Date.now() + windowMs),
      });

      next();
    } catch (error) {
      console.error("Redis rate limit error:", error);
      next();
    }
  };
};

const sessionCache = {
  async get(sessionId) {
    try {
      const data = await redisClient.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Redis session get error:", error);
      return null;
    }
  },

  async set(sessionId, sessionData, expiration = 24 * 60 * 60) {
    try {
      await redisClient.setEx(
        `session:${sessionId}`,
        expiration,
        JSON.stringify(sessionData)
      );
    } catch (error) {
      console.error("Redis session set error:", error);
    }
  },

  async delete(sessionId) {
    try {
      await redisClient.del(`session:${sessionId}`);
    } catch (error) {
      console.error("Redis session delete error:", error);
    }
  },

  async extend(sessionId, expiration = 24 * 60 * 60) {
    try {
      await redisClient.expire(`session:${sessionId}`, expiration);
    } catch (error) {
      console.error("Redis session extend error:", error);
    }
  },
};

const cacheInvalidation = {
  async invalidateUser(userId) {
    try {
      await redisClient.del(`user:${userId}`);
      console.log(`Cache invalidated for user:${userId}`);
    } catch (error) {
      console.error("Cache invalidation error:", error);
    }
  },

  async invalidatePattern(pattern) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log(`Cache invalidated for pattern: ${pattern}`);
      }
    } catch (error) {
      console.error("Cache pattern invalidation error:", error);
    }
  },
};

module.exports = {
  redisRateLimit,
  sessionCache,
  cacheInvalidation,
};
