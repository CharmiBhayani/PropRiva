const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");
const sendEmail = require("../../utils/sendEmail");

const register = async (data) => {

  // check existing user
  const existingUser = await prisma.user.findUnique({
    where: {
      email: data.email,
    },
  });

  if (existingUser) {
    throw new Error("User already exists");
  }

  // hash password
  const hashedPassword = await bcrypt.hash(
    data.password,
    10
  );

  // generate otp
  const otp = Math.floor(
    100000 + Math.random() * 900000
  ).toString();

  // otp expiry (5 mins)
  const otpExpiry = new Date(
    Date.now() + 5 * 60 * 1000
  );

  // create user
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashedPassword,

      phone: data.phone,
      occupation: data.occupation,
      dob: data.dob ? new Date(data.dob) : null,

      otp,
      otpExpiry,
    },
  });

  // send email
  await sendEmail(
    user.email,
    "OTP Verification",
    `Your OTP is ${otp}`
  );

  return user;
};

module.exports = {
  register,
};