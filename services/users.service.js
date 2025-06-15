const User = require("../models/User");
const TokenService = require("./token.service");
const EmailService = require("./email.service");
const { Op } = require("sequelize");

const { redisClient } = require("../config/database");

class CacheService {
  async get(key) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("Redis get error:", error);
      return null;
    }
  }

  async set(key, value, expiration = 3600) {
    try {
      await redisClient.setEx(key, expiration, JSON.stringify(value));
    } catch (error) {
      console.error("Redis set error:", error);
    }
  }

  async del(key) {
    try {
      await redisClient.del(key);
    } catch (error) {
      console.error("Redis del error:", error);
    }
  }
}

const cacheService = new CacheService();

class UsersService {
  async register(fullname, username, email, password, role = "user") {
    try {
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [{ email }, { username }],
        },
      });

      if (existingUser) {
        if (existingUser.email === email) {
          throw { status: 400, message: "Email already registered" };
        }
        if (existingUser.username === username) {
          throw { status: 400, message: "Username already taken" };
        }
      }

      const emailVerificationToken = TokenService.generateRandomToken();
      const emailVerificationExpires = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      );

      const user = await User.create({
        fullname,
        username,
        email,
        password,
        role,
        emailVerificationToken,
        emailVerificationExpires,
      });

      const { accessToken, refreshToken } = TokenService.generateTokenPair({
        id: user.id,
      });

      await user.update({ refreshToken });

      await EmailService.sendEmailVerification(
        email,
        emailVerificationToken,
        fullname
      );

      return {
        message:
          "Registration successful. Please check your email to verify your account.",
        access_token: accessToken,
        refresh_token: refreshToken,
        user: user.toJSON(),
      };
    } catch (error) {
      throw error;
    }
  }

  async login(email, password, userData = null) {
    try {
      let user;

      if (userData) {
        user = userData;
      } else {
        user = await User.findOne({ where: { email } });
      }

      if (!user) {
        throw { status: 400, message: "Invalid credentials" };
      }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw { status: 400, message: "Invalid credentials" };
      }

      if (!user.isEmailVerified) {
        throw {
          status: 400,
          message: "Please verify your email before logging in",
        };
      }

      if (!user.isActive) {
        throw { status: 400, message: "Account has been deactivated" };
      }

      const { accessToken, refreshToken } = TokenService.generateTokenPair({
        id: user.id,
      });

      await user.update({
        refreshToken,
        lastLogin: new Date(),
      });

      await cacheService.set(`user:${user.id}`, user.toJSON(), 3600);

      return {
        message: "Login successful",
        access_token: accessToken,
        refresh_token: refreshToken,
        user: user.toJSON(),
      };
    } catch (error) {
      throw error;
    }
  }

  async socialLogin(email, name, picture) {
    try {
      let user = await User.findOne({ where: { email } });

      if (user) {
        const { accessToken, refreshToken } = TokenService.generateTokenPair({
          id: user.id,
        });

        await user.update({
          refreshToken,
          lastLogin: new Date(),
          profileImage: picture || user.profileImage,
        });

        return {
          message: "Login successful",
          access_token: accessToken,
          refresh_token: refreshToken,
          user: user.toJSON(),
          status_code: 204,
        };
      } else {
        return {
          message: "Account setup required",
          user: { email, fullname: name, profileImage: picture },
          status_code: 201,
        };
      }
    } catch (error) {
      throw error;
    }
  }

  async accountSetup(email, username, password, role = "user") {
    try {
      const existingUser = await User.findOne({ where: { username } });
      if (existingUser) {
        throw { status: 400, message: "Username already taken" };
      }

      const user = await User.create({
        fullname: "Social User",
        username,
        email,
        password,
        role,
        isEmailVerified: true,
        profileImage: null,
      });

      const { accessToken, refreshToken } = TokenService.generateTokenPair({
        id: user.id,
      });

      await user.update({ refreshToken });

      return {
        message: "Account setup successful",
        access_token: accessToken,
        refresh_token: refreshToken,
        user: user.toJSON(),
      };
    } catch (error) {
      throw error;
    }
  }

  async forgotPassword(email) {
    try {
      const user = await User.findOne({ where: { email } });
      if (!user) {
        throw { status: 400, message: "User not found" };
      }

      const resetToken = TokenService.generateRandomToken();
      const otp = TokenService.generateOTP();
      const resetExpires = new Date(Date.now() + 15 * 60 * 1000);

      await user.update({
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      });

      await EmailService.sendPasswordResetOTP(email, otp, user.fullname);

      await cacheService.set(`otp:${email}`, otp, 900);

      return { message: "Password reset OTP sent to your email" };
    } catch (error) {
      throw error;
    }
  }

  async resetPassword(email, otp, newPassword) {
    try {
      const user = await User.findOne({ where: { email } });
      if (!user) {
        throw { status: 400, message: "User not found" };
      }

      const cachedOTP = await cacheService.get(`otp:${email}`);
      if (!cachedOTP || cachedOTP !== otp) {
        throw { status: 400, message: "Invalid or expired OTP" };
      }

      if (!user.passwordResetToken || !user.passwordResetExpires) {
        throw { status: 400, message: "Password reset not requested" };
      }

      if (new Date() > user.passwordResetExpires) {
        throw { status: 400, message: "Password reset token expired" };
      }

      await user.update({
        password: newPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      });

      await cacheService.del(`otp:${email}`);

      return { message: "Password reset successful" };
    } catch (error) {
      throw error;
    }
  }

  async verifyEmail(email, token) {
    try {
      const user = await User.findOne({
        where: {
          email,
          emailVerificationToken: token,
          emailVerificationExpires: {
            [Op.gt]: new Date(),
          },
        },
      });

      if (!user) {
        throw { status: 400, message: "Invalid or expired verification token" };
      }

      await user.update({
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      });

      await EmailService.sendWelcomeEmail(email, user.fullname);

      return { message: "Email verified successfully" };
    } catch (error) {
      throw error;
    }
  }

  async getUserProfile(userId) {
    try {
      const cachedUser = await cacheService.get(`user:${userId}`);
      if (cachedUser) return cachedUser;

      const user = await User.findByPk(userId);
      if (!user) {
        throw { status: 404, message: "User not found" };
      }

      await cacheService.set(`user:${userId}`, user.toJSON(), 3600);

      return user.toJSON();
    } catch (error) {
      throw error;
    }
  }

  async updateProfile(userId, updateData) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw { status: 404, message: "User not found" };
      }

      const {
        password,
        refreshToken,
        emailVerificationToken,
        passwordResetToken,
        ...allowedUpdates
      } = updateData;

      await user.update(allowedUpdates);

      await cacheService.del(`user:${userId}`);

      return user.toJSON();
    } catch (error) {
      throw error;
    }
  }

  async getAllUsers(
    page = 1,
    limit = 10,
    search = "",
    role = "",
    status = "",
    sortBy = "createdAt",
    sortOrder = "desc"
  ) {
    try {
      const offset = (page - 1) * limit;
      let whereClause = {};

      if (search) {
        whereClause[Op.or] = [
          { fullname: { [Op.like]: `%${search}%` } },
          { username: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
        ];
      }

      if (role && role !== "all") {
        whereClause.role = role;
      }

      if (status && status !== "all") {
        if (status === "active") {
          whereClause.isActive = true;
        } else if (status === "inactive") {
          whereClause.isActive = false;
        } else if (status === "verified") {
          whereClause.isEmailVerified = true;
        } else if (status === "unverified") {
          whereClause.isEmailVerified = false;
        }
      }

      const validSortFields = [
        "fullname",
        "username",
        "email",
        "role",
        "createdAt",
        "lastLogin",
      ];
      const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
      const order = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

      const { count, rows } = await User.findAndCountAll({
        where: whereClause,
        offset,
        limit: parseInt(limit),
        order: [[sortField, order]],
        attributes: { exclude: ["password", "refreshToken"] },
      });

      return {
        users: rows.map((user) => ({
          ...user.toJSON(),
          status: user.isActive ? "active" : "inactive",
          verificationStatus: user.isEmailVerified ? "verified" : "unverified",
        })),
        total: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        hasNextPage: page < Math.ceil(count / limit),
        hasPrevPage: page > 1,
      };
    } catch (error) {
      throw error;
    }
  }

  async deleteUser(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw { status: 404, message: "User not found" };
      }

      await user.destroy();

      await cacheService.del(`user:${userId}`);

      return { message: "User deleted successfully" };
    } catch (error) {
      throw error;
    }
  }

  async bulkUserAction(userIds, action) {
    try {
      const users = await User.findAll({
        where: { id: { [Op.in]: userIds } },
      });

      if (users.length === 0) {
        throw { status: 404, message: "No users found" };
      }

      let updateData = {};
      let message = "";

      switch (action) {
        case "activate":
          updateData = { isActive: true };
          message = "Users activated successfully";
          break;
        case "deactivate":
          updateData = { isActive: false };
          message = "Users deactivated successfully";
          break;
        case "delete":
          await User.destroy({ where: { id: { [Op.in]: userIds } } });
          for (const userId of userIds) {
            await cacheService.del(`user:${userId}`);
          }
          return { message: "Users deleted successfully" };
        default:
          throw { status: 400, message: "Invalid action" };
      }

      await User.update(updateData, {
        where: { id: { [Op.in]: userIds } },
      });

      for (const userId of userIds) {
        await cacheService.del(`user:${userId}`);
      }

      return { message };
    } catch (error) {
      throw error;
    }
  }

  async toggleUserStatus(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw { status: 404, message: "User not found" };
      }

      await user.update({ isActive: !user.isActive });

      await cacheService.del(`user:${userId}`);

      return {
        message: `User ${
          user.isActive ? "activated" : "deactivated"
        } successfully`,
        user: user.toJSON(),
      };
    } catch (error) {
      throw error;
    }
  }

  async getUserStats() {
    try {
      const totalUsers = await User.count();
      const activeUsers = await User.count({ where: { isActive: true } });
      const verifiedUsers = await User.count({
        where: { isEmailVerified: true },
      });
      const adminUsers = await User.count({ where: { role: "admin" } });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentRegistrations = await User.count({
        where: {
          createdAt: { [Op.gte]: thirtyDaysAgo },
        },
      });

      return {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        verifiedUsers,
        unverifiedUsers: totalUsers - verifiedUsers,
        adminUsers,
        regularUsers: totalUsers - adminUsers,
        recentRegistrations,
      };
    } catch (error) {
      throw error;
    }
  }

  async exportUsers(search = "", role = "", status = "") {
    try {
      let whereClause = {};

      if (search) {
        whereClause[Op.or] = [
          { fullname: { [Op.like]: `%${search}%` } },
          { username: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
        ];
      }

      if (role && role !== "all") {
        whereClause.role = role;
      }

      if (status && status !== "all") {
        if (status === "active") {
          whereClause.isActive = true;
        } else if (status === "inactive") {
          whereClause.isActive = false;
        } else if (status === "verified") {
          whereClause.isEmailVerified = true;
        } else if (status === "unverified") {
          whereClause.isEmailVerified = false;
        }
      }

      const users = await User.findAll({
        where: whereClause,
        order: [["createdAt", "DESC"]],
        attributes: { exclude: ["password", "refreshToken"] },
      });

      return users.map((user) => ({
        ...user.toJSON(),
        status: user.isActive ? "active" : "inactive",
        verificationStatus: user.isEmailVerified ? "verified" : "unverified",
      }));
    } catch (error) {
      throw error;
    }
  }

  createAccessToken(payload) {
    return TokenService.generateAccessToken(payload);
  }
}

module.exports = new UsersService();
