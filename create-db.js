const { sequelize } = require("./config/database");
const User = require("./models/User");
require("dotenv").config();

const createDatabase = async () => {
  try {
    console.log(" Connecting to database...");

    await sequelize.authenticate();
    console.log("Database connection established successfully.");

    console.log("Creating database tables...");
    await sequelize.sync({ force: false, alter: true });
    console.log("Database tables created successfully.");

    const adminExists = await User.findOne({ where: { role: "admin" } });

    if (!adminExists) {
      console.log(" Creating default admin user...");
      const adminUser = await User.create({
        fullname: "System Administrator",
        username: "admin",
        email: "admin@example.com",
        password: "Admin123!",
        role: "admin",
        isEmailVerified: true,
        isActive: true,
      });

      console.log("Default admin user created successfully.");
      console.log(" Admin Email:", adminUser.email);
      console.log("Admin Password: Admin123!");
      console.log("Please change the admin password after first login.");
    } else {
      console.log("ℹ Admin user already exists.");
    }

    console.log(" Database setup completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Database setup failed:", error);
    process.exit(1);
  }
};

createDatabase();
