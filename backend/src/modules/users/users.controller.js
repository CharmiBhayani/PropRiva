const userService = require("./users.service");

const getMe = async (req, res) => {
  try {

    const user = await userService.getMe(
      req.user.id
    );

    res.status(200).json({
      success: true,
      user,
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: error.message,
    });

  }
};

module.exports = {
  getMe,
};