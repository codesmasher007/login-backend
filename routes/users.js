const router = require("express").Router();
const Controller = require("../controllers/auth");
const {
  authenticate,
  isAdmin,
  isOwnerOrAdmin,
} = require("../middlewares/auth");
const { uploadSingle } = require("../middlewares/upload");

router.get("/:userId", authenticate, isOwnerOrAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await require("../services/users.service").getUserProfile(
      userId
    );

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  "/:userId",
  authenticate,
  isOwnerOrAdmin,
  uploadSingle("profileImage"),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const updateData = { ...req.body };

      if (req.file) {
        updateData.profileImage = `/uploads/${req.file.filename}`;
      }

      const user = await require("../services/users.service").updateProfile(
        userId,
        updateData
      );

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        user,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/:userId/password",
  authenticate,
  isOwnerOrAdmin,
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required",
        });
      }

      const User = require("../models/User");
      const user = await User.findByPk(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (req.user.role !== "admin" || req.user.id === userId) {
        const isCurrentPasswordValid = await user.comparePassword(
          currentPassword
        );
        if (!isCurrentPasswordValid) {
          return res.status(400).json({
            success: false,
            message: "Current password is incorrect",
          });
        }
      }

      await user.update({ password: newPassword });

      res.status(200).json({
        success: true,
        message: "Password updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/:userId/toggle-status",
  authenticate,
  isAdmin,
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const User = require("../models/User");

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      await user.update({ isActive: !user.isActive });

      res.status(200).json({
        success: true,
        message: `User ${
          user.isActive ? "activated" : "deactivated"
        } successfully`,
        user: user.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
