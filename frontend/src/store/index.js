import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import propertiesReducer from "./propertiesSlice";
import leasesReducer from "./leasesSlice";
import notificationsReducer from "./notificationsSlice";
import paymentsReducer from "./paymentsSlice";
import maintenanceReducer from "./maintenanceSlice";
import advisoryReducer from "./advisorySlice";

const store = configureStore({
  reducer: {
    auth: authReducer,
    properties: propertiesReducer,
    leases: leasesReducer,
    notifications: notificationsReducer,
    payments: paymentsReducer,
    maintenance: maintenanceReducer,
    advisory: advisoryReducer,
  },
});

export default store;
