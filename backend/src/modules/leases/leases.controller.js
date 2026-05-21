const leaseService = require(
  "./leases.service"
);

const inviteTenant = async (
  req,
  res
) => {

  try {

    const lease =
      await leaseService.inviteTenant(
        req.body,
        req.user.id
      );

    res.status(201).json({
      success: true,
      lease,
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: error.message,
    });

  }

};

module.exports = {
  inviteTenant,
};