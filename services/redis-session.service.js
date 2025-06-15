const { redisClient } = require("../config/database");
const jwt = require("jsonwebtoken");

class RedisSessionService {
  async createSession(userId, tokenData, expiration = 24 * 60 * 60) {
    try {
      const sessionId = this.generateSessionId();
      const sessionData = {
        userId,
        ...tokenData,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      };

      await redisClient.setEx(
        `session:${sessionId}`,
        expiration,
        JSON.stringify(sessionData)
      );
      await redisClient.setEx(`user_session:${userId}`, expiration, sessionId);

      return sessionId;
    } catch (error) {
      console.error("Redis session creation error:", error);
      throw error;
    }
  }

  async getSession(sessionId) {
    try {
      const sessionData = await redisClient.get(`session:${sessionId}`);
      if (!sessionData) return null;

      const session = JSON.parse(sessionData);

      session.lastAccessed = new Date().toISOString();
      await redisClient.setEx(
        `session:${sessionId}`,
        24 * 60 * 60,
        JSON.stringify(session)
      );

      return session;
    } catch (error) {
      console.error("Redis session get error:", error);
      return null;
    }
  }

  async destroySession(sessionId) {
    try {
      const sessionData = await this.getSession(sessionId);
      if (sessionData) {
        await redisClient.del(`session:${sessionId}`);
        await redisClient.del(`user_session:${sessionData.userId}`);
      }
    } catch (error) {
      console.error("Redis session destroy error:", error);
    }
  }

  async destroyUserSessions(userId) {
    try {
      const sessionId = await redisClient.get(`user_session:${userId}`);
      if (sessionId) {
        await redisClient.del(`session:${sessionId}`);
        await redisClient.del(`user_session:${userId}`);
      }
    } catch (error) {
      console.error("Redis user sessions destroy error:", error);
    }
  }

  async extendSession(sessionId, expiration = 24 * 60 * 60) {
    try {
      await redisClient.expire(`session:${sessionId}`, expiration);
    } catch (error) {
      console.error("Redis session extend error:", error);
    }
  }

  generateSessionId() {
    return require("crypto").randomBytes(32).toString("hex");
  }

  async blacklistToken(token, expiration) {
    try {
      const decoded = jwt.decode(token);
      if (decoded && decoded.exp) {
        const now = Math.floor(Date.now() / 1000);
        const ttl = decoded.exp - now;

        if (ttl > 0) {
          await redisClient.setEx(`blacklist:${token}`, ttl, "blacklisted");
        }
      }
    } catch (error) {
      console.error("Token blacklist error:", error);
    }
  }

  async isTokenBlacklisted(token) {
    try {
      const result = await redisClient.get(`blacklist:${token}`);
      return result === "blacklisted";
    } catch (error) {
      console.error("Token blacklist check error:", error);
      return false;
    }
  }

  async storeTempData(key, data, expiration = 900) {
    try {
      await redisClient.setEx(`temp:${key}`, expiration, JSON.stringify(data));
    } catch (error) {
      console.error("Temp data store error:", error);
    }
  }

  async getTempData(key) {
    try {
      const data = await redisClient.get(`temp:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Temp data get error:", error);
      return null;
    }
  }

  async removeTempData(key) {
    try {
      await redisClient.del(`temp:${key}`);
    } catch (error) {
      console.error("Temp data remove error:", error);
    }
  }
}

module.exports = new RedisSessionService();
