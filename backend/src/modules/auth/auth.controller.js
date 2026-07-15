const authService = require("./auth.service");

const register = async (req, res) => {

  try {

    const user = await authService.register(
      req.body
    );

    res.status(201).json({
      success: true,
      message:
        "User registered. OTP sent to email.",
      user,
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: error.message,
    });

  }

};

const verifyOtp = async (req, res) => {
  try {

    const result = await authService.verifyOtp(
      req.body
    );

    res.status(200).json({
      success: true,
      message: result.message,
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: error.message,
    });

  }

};

const login = async (req, res) => {

  try {

    const data = await authService.login(
      req.body
    );

    res.cookie("token", data.token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: data.user,
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: error.message,
    });

  }

};

const logout = async (req, res) => {

  res.clearCookie("token");

  res.status(200).json({
    success: true,
    message: "Logout successful",
  });

};

const resendOtp = async (
  req,
  res
) => {

  try {

    const result =
      await authService.resendOtp(
        req.body.email
      );

    res.status(200).json({
      success: true,
      message: result.message,
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: error.message,
    });

  }

};

module.exports = {
  register,
  verifyOtp,
  login,
  logout,
  resendOtp,
};