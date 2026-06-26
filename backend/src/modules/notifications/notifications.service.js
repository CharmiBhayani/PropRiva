const prisma = require("../../config/prisma");

const createNotification = async (userId, message, type) => {
  return await prisma.notification.create({
    data: {
      userId,
      message,
      type,
    },
  });
};

const getNotificationsForUser = async (userId) => {
  return await prisma.notification.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

const markAsRead = async (notificationId, userId) => {
  const notification = await prisma.notification.findUnique({
    where: {
      id: Number(notificationId),
    },
  });

  if (!notification) {
    throw new Error("Notification not found");
  }

  if (notification.userId !== userId) {
    throw new Error("Unauthorized");
  }

  return await prisma.notification.update({
    where: {
      id: notification.id,
    },
    data: {
      isRead: true,
    },
  });
};

const markAllAsRead = async (userId) => {
  return await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });
};

module.exports = {
  createNotification,
  getNotificationsForUser,
  markAsRead,
  markAllAsRead,
};
