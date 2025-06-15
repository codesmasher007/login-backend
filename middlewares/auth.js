const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RedisSessionService = require("../services/redis-session.service");

const authenticate = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res
        .status(401)
        .json({ message: "Access denied. No token provided." });
    }

    const isBlacklisted = await RedisSessionService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ message: "Token has been invalidated." });
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ message: "Invalid token or user not found." });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired." });
    }
    return res.status(401).json({ message: "Invalid token." });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    return res
      .status(403)
      .json({ message: "Access denied. Admin privileges required." });
  }
};

const isOwnerOrAdmin = (req, res, next) => {
  const resourceUserId = req.params.userId || req.params.id;

  if (
    req.user &&
    (req.user.id === resourceUserId || req.user.role === "admin")
  ) {
    next();
  } else {
    return res
      .status(403)
      .json({ message: "Access denied. Insufficient privileges." });
  }
};

module.exports = {
  authenticate,
  isAdmin,
  isOwnerOrAdmin,
};
