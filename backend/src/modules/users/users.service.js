const prisma = require("../../config/prisma");

const getMe = async (userId) => {

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },

    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      avatar: true,
      occupation: true,
      isVerified: true,
      createdAt: true,
    },
  });

  return user;
};

module.exports = {
  getMe,
};