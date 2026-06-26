const prisma = require("../../config/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
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

  // send OTP email
  await sendEmail(
    user.email,
    "OTP Verification - PropRiva",
    `Your PropRiva OTP is: ${otp}\n\nThis code expires in 5 minutes.`
  );

  return user;
};

const verifyOtp = async (data) => {

  const user = await prisma.user.findUnique({
    where: {
      email: data.email,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.isVerified) {
    throw new Error("User already verified");
  }

  if (user.otp !== data.otp) {
    throw new Error("Invalid OTP");
  }

  // check expiry
  if (new Date() > user.otpExpiry) {
    throw new Error("OTP expired");
  }

  // update user
  await prisma.user.update({
    where: {
      email: data.email,
    },
    data: {
      isVerified: true,
      otp: null,
      otpExpiry: null,
    },
  });

  return {
    message: "OTP verified successfully",
  };
};

const login = async (data) => {

  const user = await prisma.user.findUnique({
    where: {
      email: data.email,
    },
  });

  if (!user) {
    throw new Error("Invalid credentials");
  }

  if (!user.isVerified) {
    throw new Error("Please verify your email");
  }

  const isMatch = await bcrypt.compare(
    data.password,
    user.password
  );

  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  // generate jwt
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
       role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );

  return {
    token,
    user,
  };
};

const resendOtp = async (
  email
) => {

  const user =
    await prisma.user.findUnique({
      where: {
        email,
      },
    });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.isVerified) {
    throw new Error(
      "User already verified"
    );
  }

  // generate new otp
  const otp = Math.floor(
    100000 + Math.random() * 900000
  ).toString();

  // new expiry
  const otpExpiry =
    new Date(Date.now() + 5 * 60 * 1000);

  // update user
  await prisma.user.update({
    where: {
      email,
    },

    data: {
      otp,
      otpExpiry,
    },
  });

  // send email
  await sendEmail(
    user.email,
    "Resend OTP - PropRiva",
    `Your new PropRiva OTP is: ${otp}\n\nThis OTP will expire in 5 minutes.`
  );

  return {
    message:
      "OTP resent successfully",
    };
};

module.exports = {
  register,
  verifyOtp,
  login,
  resendOtp,
};