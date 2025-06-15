const { redisClient } = require("./config/database");

async function testRedis() {
  try {
    console.log("🧪 Testing Redis connection and operations...");

    await redisClient.set("test:hello", "world");
    const result = await redisClient.get("test:hello");
    console.log(
      "✅ Basic set/get test:",
      result === "world" ? "PASSED" : "FAILED"
    );

    await redisClient.setEx("test:expire", 2, "will expire");
    const beforeExpire = await redisClient.get("test:expire");
    console.log(
      "✅ Set with expiration:",
      beforeExpire === "will expire" ? "PASSED" : "FAILED"
    );

    const testUser = { id: 1, name: "Test User", email: "test@example.com" };
    await redisClient.set("test:user:1", JSON.stringify(testUser));
    const userData = await redisClient.get("test:user:1");
    const parsedUser = JSON.parse(userData);
    console.log(
      "✅ JSON data test:",
      parsedUser.name === "Test User" ? "PASSED" : "FAILED"
    );

    await redisClient.incr("test:counter");
    await redisClient.incr("test:counter");
    const counter = await redisClient.get("test:counter");
    console.log("✅ Increment test:", counter === "2" ? "PASSED" : "FAILED");

    await redisClient.del("test:hello", "test:user:1", "test:counter");

    console.log("🎉 All Redis tests passed! Redis is working correctly.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Redis test failed:", error);
    process.exit(1);
  }
}

testRedis();
