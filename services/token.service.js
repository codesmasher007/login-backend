const jwt = require("jsonwebtoken");
const crypto = require("crypto");

class TokenService {
  generateAccessToken(payload) {
    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || "15m",
    });
  }

  generateRefreshToken(payload) {
    return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRE || "30d",
    });
  }

  verifyAccessToken(token) {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  }

  verifyRefreshToken(token) {
    return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
  }

  generateRandomToken() {
    return crypto.randomBytes(32).toString("hex");
  }

  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  generateTokenPair(payload) {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
    };
  }

  decodeToken(token) {
    return jwt.decode(token);
  }

  isTokenExpired(token) {
    try {
      const decoded = jwt.decode(token);
      const currentTime = Date.now() / 1000;
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }
}

module.exports = new TokenService();
