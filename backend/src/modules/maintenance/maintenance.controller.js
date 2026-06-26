const maintenanceService = require("./maintenance.service");

const createRequest = async (req, res) => {
  try {
    const request = await maintenanceService.createRequest(req.body, req.user.id);
    res.status(201).json({
      success: true,
      request,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const decideRequest = async (req, res) => {
  try {
    const { decision, reason } = req.body;
    if (!decision) {
      return res.status(400).json({
        success: false,
        message: "decision is required",
      });
    }

    const request = await maintenanceService.decideRequest(req.params.id, decision, req.user.id, reason);
    res.status(200).json({
      success: true,
      request,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const getMyRequests = async (req, res) => {
  try {
    const requests = await maintenanceService.getRequestsForUser(req.user.id, req.query.leaseId);
    res.status(200).json({
      success: true,
      requests,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createRequest,
  decideRequest,
  getMyRequests,
};
