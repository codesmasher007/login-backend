const UsersService = require("../services/users.service");
const TokenService = require("../services/token.service");
const User = require("../models/User");
const { google } = require("googleapis");
const { OAuth2 } = google.auth;
const { cacheInvalidation } = require("../middlewares/redis");
const RedisSessionService = require("../services/redis-session.service");
const client = new OAuth2(process.env.GOOGLE_CLIENT_ID);

class Controller {
  async login(req, res, next) {
    try {
      const { email, username, password } = req.body;

      let user;
      if (email) {
        user = await User.findOne({ where: { email } });
      } else if (username) {
        user = await User.findOne({ where: { username } });
      }

      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }

      const {
        message,
        access_token,
        refresh_token,
        user: userData,
      } = await UsersService.login(email || user.email, password, user);

      res.cookie("refreshtoken", refresh_token, {
        httpOnly: true,
        path: "/api/auth/refresh_token",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      res.status(200).json({
        success: true,
        message,
        access_token,
        user: userData,
      });
    } catch (error) {
      next(error);
    }
  }

  async register(req, res, next) {
    try {
      const { fullname, username, email, password, role } = req.body;

      const { message, access_token, refresh_token, user } =
        await UsersService.register(fullname, username, email, password, role);

      res.cookie("refreshtoken", refresh_token, {
        httpOnly: true,
        path: "/api/auth/refresh_token",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      res.status(201).json({
        success: true,
        message,
        access_token,
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  async googleLogin(req, res, next) {
    try {
      const { tokenId } = req.body;

      const verify = await client.verifyIdToken({
        idToken: tokenId,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const { email, name, picture } = verify.payload;

      const { message, access_token, user, refresh_token, status_code } =
        await UsersService.socialLogin(email, name, picture);

      if (status_code === 204) {
        res.cookie("refreshtoken", refresh_token, {
          httpOnly: true,
          path: "/api/auth/refresh_token",
          maxAge: 30 * 24 * 60 * 60 * 1000,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
        });
      }

      res.status(200).json({
        success: true,
        message,
        access_token,
        user,
        status_code,
      });
    } catch (error) {
      next(error);
    }
  }

  async accountsetup(req, res, next) {
    try {
      const { email, username, password, role } = req.body;

      const { message, access_token, user, refresh_token } =
        await UsersService.accountSetup(email, username, password, role);

      res.cookie("refreshtoken", refresh_token, {
        httpOnly: true,
        path: "/api/auth/refresh_token",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      res.status(200).json({
        success: true,
        message,
        access_token,
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      await UsersService.forgotPassword(email);
      res.status(200).json({
        success: true,
        message: "Password reset OTP sent to your email",
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { email, otp, newPassword } = req.body;

      await UsersService.resetPassword(email, otp, newPassword);
      res.status(200).json({
        success: true,
        message: "Password reset successful",
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req, res, next) {
    try {
      const { email, token } = req.query;

      await UsersService.verifyEmail(email, token);
      res.status(200).json({
        success: true,
        message: "Email verified successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      if (req.token) {
        await RedisSessionService.blacklistToken(req.token);
      }

      res.clearCookie("refreshtoken", { path: "/api/auth/refresh_token" });

      if (req.user) {
        await RedisSessionService.destroyUserSessions(req.user.id);
        await cacheInvalidation.invalidateUser(req.user.id);
      }

      return res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async generateAccessToken(req, res, next) {
    try {
      const rf_token = req.cookies.refreshtoken;

      if (!rf_token) {
        return res.status(401).json({
          success: false,
          message: "Please login again",
        });
      }

      const decoded = TokenService.verifyRefreshToken(rf_token);
      const user = await User.findByPk(decoded.id);

      if (!user || user.refreshToken !== rf_token) {
        return res.status(401).json({
          success: false,
          message: "Invalid refresh token",
        });
      }

      const access_token = TokenService.generateAccessToken({ id: user.id });

      res.status(200).json({
        success: true,
        access_token,
        user: user.toJSON(),
      });
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        res.clearCookie("refreshtoken", { path: "/api/auth/refresh_token" });
        return res.status(401).json({
          success: false,
          message: "Refresh token expired. Please login again.",
        });
      }
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      const user = await UsersService.getUserProfile(req.user.id);
      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const updateData = { ...req.body };

      if (req.file) {
        updateData.profileImage = `/uploads/${req.file.filename}`;
      }

      const user = await UsersService.updateProfile(req.user.id, updateData);
      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        user,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUsers(req, res, next) {
    try {
      const {
        page = 1,
        limit = 10,
        search = "",
        role = "",
        status = "",
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const result = await UsersService.getAllUsers(
        parseInt(page),
        parseInt(limit),
        search,
        role,
        status,
        sortBy,
        sortOrder
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req, res, next) {
    try {
      const { userId } = req.params;

      await UsersService.deleteUser(userId);
      res.status(200).json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new Controller();
