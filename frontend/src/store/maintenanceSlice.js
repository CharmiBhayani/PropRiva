import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../services/api";

// ── Thunks ──────────────────────────────────────────────────────────────────

/**
 * Tenant: File a new maintenance/repair bill for a lease.
 * Payload: { leaseId, description, vendorName, cost, invoiceNo (optional),
 *            invoiceDate (optional), billFile (base64 or url, optional) }
 */
export const fileMaintenance = createAsyncThunk(
  "maintenance/file",
  async (payload, { rejectWithValue }) => {
    try {
      const res = await API.post("/maintenance", payload);
      return res.data.request;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

/**
 * Fetch all maintenance requests.
 * Tenant: gets their own. Landlord: gets all for their properties.
 * Optional filter: leaseId
 */
export const fetchMaintenanceRequests = createAsyncThunk(
  "maintenance/fetchAll",
  async (leaseId, { rejectWithValue }) => {
    try {
      const url = leaseId
        ? `/maintenance/my-requests?leaseId=${leaseId}`
        : "/maintenance/my-requests";
      const res = await API.get(url);
      return res.data.requests;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

/**
 * Landlord: Approve a maintenance request — pays back tenant.
 */
export const approveMaintenance = createAsyncThunk(
  "maintenance/approve",
  async (requestId, { rejectWithValue }) => {
    try {
      const res = await API.put(`/maintenance/${requestId}/decision`, { decision: "PAY_DIRECTLY" });
      return res.data.request;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

/**
 * Landlord: Adjust rent — deducts the bill amount from next rent due.
 */
export const adjustRentMaintenance = createAsyncThunk(
  "maintenance/adjustRent",
  async (requestId, { rejectWithValue }) => {
    try {
      const res = await API.put(`/maintenance/${requestId}/decision`, { decision: "ADJUST_RENT" });
      return res.data.request;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

/**
 * Landlord: Reject a maintenance request.
 */
export const rejectMaintenance = createAsyncThunk(
  "maintenance/reject",
  async ({ requestId, reason }, { rejectWithValue }) => {
    try {
      const res = await API.put(`/maintenance/${requestId}/decision`, { decision: "REJECT", reason });
      return res.data.request;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function upsert(list, updated) {
  const idx = list.findIndex((r) => r.id === updated.id);
  if (idx >= 0) list[idx] = updated;
  else list.unshift(updated);
}

// ── Slice ────────────────────────────────────────────────────────────────────

const maintenanceSlice = createSlice({
  name: "maintenance",
  initialState: {
    requests: [],
    loading: false,
    actionLoading: false, // for approve/reject/adjust actions
    error: null,
    fileSuccess: false,
  },
  reducers: {
    clearMaintenanceError: (state) => {
      state.error = null;
    },
    clearFileSuccess: (state) => {
      state.fileSuccess = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // fileMaintenance
      .addCase(fileMaintenance.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.fileSuccess = false;
      })
      .addCase(fileMaintenance.fulfilled, (state, action) => {
        state.loading = false;
        state.fileSuccess = true;
        state.requests = [action.payload, ...state.requests];
      })
      .addCase(fileMaintenance.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // fetchMaintenanceRequests
      .addCase(fetchMaintenanceRequests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMaintenanceRequests.fulfilled, (state, action) => {
        state.loading = false;
        state.requests = action.payload;
      })
      .addCase(fetchMaintenanceRequests.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // approveMaintenance
      .addCase(approveMaintenance.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(approveMaintenance.fulfilled, (state, action) => {
        state.actionLoading = false;
        upsert(state.requests, action.payload);
      })
      .addCase(approveMaintenance.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })

      // adjustRentMaintenance
      .addCase(adjustRentMaintenance.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(adjustRentMaintenance.fulfilled, (state, action) => {
        state.actionLoading = false;
        upsert(state.requests, action.payload);
      })
      .addCase(adjustRentMaintenance.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      })

      // rejectMaintenance
      .addCase(rejectMaintenance.pending, (state) => {
        state.actionLoading = true;
        state.error = null;
      })
      .addCase(rejectMaintenance.fulfilled, (state, action) => {
        state.actionLoading = false;
        upsert(state.requests, action.payload);
      })
      .addCase(rejectMaintenance.rejected, (state, action) => {
        state.actionLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearMaintenanceError, clearFileSuccess } =
  maintenanceSlice.actions;
export default maintenanceSlice.reducer;
