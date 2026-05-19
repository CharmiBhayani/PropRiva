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

const verifyOtp = async(req,res)=>{
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

module.exports = {
  register,
  verifyOtp,
};