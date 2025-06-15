const router = require("express").Router();
const Controller = require("../controllers/auth");
const {
  authenticate,
  isAdmin,
  isOwnerOrAdmin,
} = require("../middlewares/auth");
const { uploadSingle } = require("../middlewares/upload");
const { redisRateLimit } = require("../middlewares/redis");

const {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateAccountSetup,
  validateGoogleLogin,
} = require("../validations/auth");

const authRateLimit = redisRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many authentication attempts, please try again later.",
});

const generalRateLimit = redisRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many requests, please try again later.",
});

router.post("/register", authRateLimit, validateRegister, Controller.register);
router.post("/login", authRateLimit, validateLogin, Controller.login);
router.post(
  "/googlelogin",
  authRateLimit,
  validateGoogleLogin,
  Controller.googleLogin
);
router.post(
  "/accountsetup",
  generalRateLimit,
  validateAccountSetup,
  Controller.accountsetup
);
router.post(
  "/forgot-password",
  authRateLimit,
  validateForgotPassword,
  Controller.forgotPassword
);
router.post(
  "/reset-password",
  authRateLimit,
  validateResetPassword,
  Controller.resetPassword
);
router.get("/verify-email", generalRateLimit, Controller.verifyEmail);
router.post("/refresh_token", generalRateLimit, Controller.generateAccessToken);
router.post("/logout", authenticate, Controller.logout);

router.get("/profile", authenticate, Controller.getProfile);
router.put(
  "/profile",
  authenticate,
  uploadSingle("profileImage"),
  Controller.updateProfile
);

router.get("/users", authenticate, isAdmin, Controller.getUsers);
router.delete("/users/:userId", authenticate, isAdmin, Controller.deleteUser);

module.exports = router;
