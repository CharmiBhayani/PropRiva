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

const approveLease = async (
  req,
  res
) => {

  try {

    const lease =
      await leaseService.approveLease(
        req.params.id,
        req.user.id
      );

    res.status(200).json({
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

const rejectLease = async (
  req,
  res
) => {

  try {

    const lease =
      await leaseService.rejectLease(
        req.params.id,
        req.user.id
      );

    res.status(200).json({
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

const getMyLeases = async (
  req,
  res
) => {

  try {

    const leases =
      await leaseService.getMyLeases(
        req.user.id
      );

    res.status(200).json({
      success: true,
      leases,
    });

  } catch (error) {

    res.status(400).json({
      success: false,
      message: error.message,
    });

  }

};

const getPendingInvites = async (
  req,
  res
) => {

  try {

    const invites =
      await leaseService.getPendingInvites(
        req.user.id
      );

    res.status(200).json({
      success: true,
      invites,
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
  approveLease,
  rejectLease,
  getMyLeases,
  getPendingInvites,
};